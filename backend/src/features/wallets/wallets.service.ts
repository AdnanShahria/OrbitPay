import { eq, and, desc, asc, inArray, sql } from 'drizzle-orm';
import type { AppDb } from '../../db/client';
import {
  merchantDevices,
  merchantWallets,
  type MerchantRecord,
  type MerchantWalletRecord,
  type MfsProvider,
  MFS_PROVIDERS,
} from '../../db/schema';
import { generateSecureToken } from '../../shared/crypto';
import { BadRequestError, NotFoundError } from '../../shared/errors';
import { sanitizePhoneNumber } from '../../shared/parsers/mfs';
import type { Env } from '../../shared/types';
import { getMerchantPushHubStatus } from '../../router/push-hub';
import { emitMerchantRealtimeEvent } from '../realtime/realtime.service';
import { dispatchWebhook } from '../webhooks/webhook.dispatcher';
import type { CreateWalletInput, SyncWalletsInput, UpdateWalletInput } from './wallets.schema';

const BANGLADESHI_PHONE_REGEX = /^01[3-9]\d{8,9}$/;
const DEVICE_ONLINE_WINDOW_MS = 10 * 60 * 1000;

export const DEFAULT_SAFE_VOLUME_LIMIT = 250_000;
export const DEFAULT_MAX_VOLUME_LIMIT = 300_000;
export const PLACEHOLDER_WALLET_NUMBERS = new Set(['01700000000', '01800000000']);

export type WalletRotationState =
  | 'ACTIVE_PRIMARY'
  | 'HEALTHY_STANDBY'
  | 'SAFE_LIMIT_OVERFLOW'
  | 'HARD_LIMIT_REACHED'
  | 'DEVICE_OFFLINE'
  | 'DISABLED';

export interface DeviceSimSlotSummary {
  slotIndex: number;
  carrierName: string;
  phoneNumber: string;
  source: string;
}

export interface ConnectedDeviceSummary {
  id: string;
  deviceName: string;
  isOnline: boolean;
  isActive: boolean;
  lastSeenAt: string | null;
  batteryLevel: number | null;
  networkType: string | null;
  appVersion: string | null;
  smsPermission: boolean | null;
  listenerEnabled: boolean | null;
  simSlots: DeviceSimSlotSummary[];
}

export interface EnrichedWalletRecord extends MerchantWalletRecord {
  safeVolumeLimit: number;
  monthlyVolumeLimit: number;
  utilizationPct: number;
  safeUtilizationPct: number;
  rotationState: WalletRotationState;
  deviceOnline: boolean | null;
  deviceName: string | null;
  isPlaceholder: boolean;
}

export interface WalletsOverviewResult {
  wallets: EnrichedWalletRecord[];
  devices: ConnectedDeviceSummary[];
  summary: {
    totalWallets: number;
    activeWallets: number;
    onlineDeviceCount: number;
    totalDeviceCount: number;
    overflowWarningCount: number;
    hardLimitReachedCount: number;
  };
}

/**
 * Returns true when a wallet number is one of the seeded demo placeholder numbers.
 */
export function isPlaceholderWalletNumber(walletNumber: string): boolean {
  const trimmed = walletNumber.trim();
  if (!trimmed) return false;
  return (
    PLACEHOLDER_WALLET_NUMBERS.has(trimmed) ||
    PLACEHOLDER_WALLET_NUMBERS.has(sanitizePhoneNumber(trimmed))
  );
}

export interface SyncMerchantWalletsResult {
  wallets: EnrichedWalletRecord[];
  devices: ConnectedDeviceSummary[];
  syncedCount: number;
  activeCount: number;
  placeholderCount: number;
  hasPlaceholderWallets: boolean;
}

function parseDeviceSimSlots(rawJson: string | null | undefined): DeviceSimSlotSummary[] {
  if (!rawJson) return [];
  try {
    const parsed = JSON.parse(rawJson);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item: Record<string, unknown>, idx: number) => ({
        slotIndex: typeof item.slotIndex === 'number' ? item.slotIndex : idx + 1,
        carrierName: String(item.carrierName || `SIM ${idx + 1}`),
        phoneNumber: sanitizePhoneNumber(String(item.phoneNumber || '')),
        source: String(item.source || 'HARDWARE'),
      }))
      .filter((s) => s.phoneNumber || s.carrierName);
  } catch {
    return [];
  }
}

/**
 * Lists all active connected Android companion devices for a merchant with online status and SIM slot telemetry.
 */
export async function listMerchantDevicesSummary(
  db: AppDb,
  merchantId: string,
  hasLiveAndroidSocket = false
): Promise<ConnectedDeviceSummary[]> {
  const rows = await db
    .select()
    .from(merchantDevices)
    .where(and(eq(merchantDevices.merchantId, merchantId), eq(merchantDevices.isActive, true)))
    .orderBy(desc(merchantDevices.lastSeenAt), desc(merchantDevices.createdAt));

  const nowMs = Date.now();
  return rows.map((d, index) => {
    const lastSeenMs = d.lastSeenAt ? d.lastSeenAt.getTime() : 0;
    const isOnline =
      (lastSeenMs > 0 && nowMs - lastSeenMs < DEVICE_ONLINE_WINDOW_MS) ||
      (hasLiveAndroidSocket && index === 0);
    return {
      id: d.id,
      deviceName: d.deviceName,
      isOnline,
      isActive: d.isActive,
      lastSeenAt: d.lastSeenAt ? d.lastSeenAt.toISOString() : null,
      batteryLevel: d.batteryLevel ?? null,
      networkType: d.networkType ?? null,
      appVersion: d.appVersion ?? null,
      smsPermission: d.smsPermission ?? null,
      listenerEnabled: d.listenerEnabled ?? null,
      simSlots: parseDeviceSimSlots(d.simSlotsJson),
    };
  });
}

function resolveWalletDevicePresence(
  wallet: MerchantWalletRecord,
  devices: ConnectedDeviceSummary[]
): { deviceOnline: boolean | null; deviceName: string | null } {
  const normalizedWalletNum = sanitizePhoneNumber(wallet.walletNumber, wallet.provider);

  if (wallet.deviceId) {
    const linked = devices.find((d) => d.id === wallet.deviceId);
    if (linked) {
      return { deviceOnline: linked.isOnline, deviceName: linked.deviceName };
    }
    return { deviceOnline: false, deviceName: null };
  }

  for (const device of devices) {
    const matchedSim = device.simSlots.find(
      (slot) => slot.phoneNumber && sanitizePhoneNumber(slot.phoneNumber, wallet.provider) === normalizedWalletNum
    );
    if (matchedSim) {
      return { deviceOnline: device.isOnline, deviceName: device.deviceName };
    }
  }

  const onlineCount = devices.filter((d) => d.isOnline).length;
  if (devices.length === 0) {
    return { deviceOnline: null, deviceName: null };
  }
  // Unpinned SIM without hardware number match can still be served if any merchant device is online
  return {
    deviceOnline: onlineCount > 0 ? true : false,
    deviceName: null,
  };
}

export function enrichWalletRecord(
  wallet: MerchantWalletRecord,
  devices: ConnectedDeviceSummary[]
): EnrichedWalletRecord {
  const hardLimit =
    wallet.monthlyVolumeLimit > 0 ? wallet.monthlyVolumeLimit : DEFAULT_MAX_VOLUME_LIMIT;
  const rawSafeLimit =
    wallet.safeVolumeLimit > 0 ? wallet.safeVolumeLimit : DEFAULT_SAFE_VOLUME_LIMIT;
  const safeLimit = Math.min(rawSafeLimit, hardLimit);
  const { deviceOnline, deviceName } = resolveWalletDevicePresence(wallet, devices);
  const isPlaceholder = isPlaceholderWalletNumber(wallet.walletNumber);

  let rotationState: WalletRotationState = 'HEALTHY_STANDBY';
  if (!wallet.isActive) {
    rotationState = 'DISABLED';
  } else if (wallet.currentMonthVolume >= hardLimit) {
    rotationState = 'HARD_LIMIT_REACHED';
  } else if (deviceOnline === false && devices.some((d) => d.isOnline)) {
    // Only mark DEVICE_OFFLINE when another device is online (failover scenario) or explicitly pinned offline
    rotationState = 'DEVICE_OFFLINE';
  } else if (wallet.currentMonthVolume >= safeLimit) {
    rotationState = 'SAFE_LIMIT_OVERFLOW';
  } else if (wallet.isPrimary) {
    rotationState = 'ACTIVE_PRIMARY';
  }

  const utilizationPct = Math.min(Math.round((wallet.currentMonthVolume / hardLimit) * 100), 100);
  const safeUtilizationPct = Math.min(Math.round((wallet.currentMonthVolume / safeLimit) * 100), 100);

  return {
    ...wallet,
    safeVolumeLimit: safeLimit,
    monthlyVolumeLimit: hardLimit,
    utilizationPct,
    safeUtilizationPct,
    rotationState,
    deviceOnline,
    deviceName,
    isPlaceholder,
  };
}

/**
 * Intelligent Multi-Device + 250k Safe / 300k Hard Limit SIM Rotation Engine.
 * Priority:
 * 1. Under safeVolumeLimit (৳2,50,000) AND device online (or unpinned when devices online/absent)
 * 2. Under safeVolumeLimit (৳2,50,000) fallback
 * 3. Graceful Overflow Zone (৳2,50,000 <= volume < ৳3,00,000): lowest volume first, preferring online device
 * 4. Hard-blocked at >= monthlyVolumeLimit (৳3,00,000)
 *
 * Automatically promotes the winning wallet to `isPrimary = true` when rotation triggers.
 */
export async function getActiveRotatedWallet(
  db: AppDb,
  merchantId: string,
  provider: MfsProvider,
  env?: Env
): Promise<EnrichedWalletRecord | null> {
  const [activeWallets, devices] = await Promise.all([
    db
      .select()
      .from(merchantWallets)
      .where(
        and(
          eq(merchantWallets.merchantId, merchantId),
          eq(merchantWallets.provider, provider),
          eq(merchantWallets.isActive, true)
        )
      )
      .orderBy(desc(merchantWallets.isPrimary), asc(merchantWallets.priorityOrder), asc(merchantWallets.currentMonthVolume)),
    listMerchantDevicesSummary(db, merchantId),
  ]);

  if (activeWallets.length === 0) {
    return null;
  }

  const realWallets = activeWallets.filter((w) => !isPlaceholderWalletNumber(w.walletNumber));
  const pool = realWallets.length > 0 ? realWallets : activeWallets;
  const enrichedPool = pool.map((w) => enrichWalletRecord(w, devices));

  const underHardLimit = enrichedPool.filter(
    (w) => w.currentMonthVolume < w.monthlyVolumeLimit
  );

  if (underHardLimit.length === 0) {
    // All SIMs reached 300k hard limit
    return null;
  }

  // Tier 1: Strictly under 250k safe limit AND device online (or unknown/no devices registered)
  const tier1 = underHardLimit.filter(
    (w) => w.currentMonthVolume < w.safeVolumeLimit && w.deviceOnline !== false
  );

  // Tier 2: Strictly under 250k safe limit (any device status)
  const tier2 = underHardLimit.filter((w) => w.currentMonthVolume < w.safeVolumeLimit);

  // Tier 3: Overflow 250k..300k — choose lowest-volume SIM, preferring online device
  const tier3 = [...underHardLimit].sort((a, b) => {
    const aOnlineScore = a.deviceOnline !== false ? 0 : 1;
    const bOnlineScore = b.deviceOnline !== false ? 0 : 1;
    if (aOnlineScore !== bOnlineScore) return aOnlineScore - bOnlineScore;
    return a.currentMonthVolume - b.currentMonthVolume;
  });

  const winner = tier1[0] || tier2[0] || tier3[0] || null;
  if (!winner) return null;

  // Auto-promote winner to primary when rotation switches away from an over-limit or offline SIM
  if (!winner.isPrimary) {
    const now = new Date();
    await db
      .update(merchantWallets)
      .set({ isPrimary: false })
      .where(
        and(
          eq(merchantWallets.merchantId, merchantId),
          eq(merchantWallets.provider, provider),
          eq(merchantWallets.isPrimary, true)
        )
      );
    await db
      .update(merchantWallets)
      .set({ isPrimary: true, lastRotatedAt: now })
      .where(eq(merchantWallets.id, winner.id));

    winner.isPrimary = true;
    winner.lastRotatedAt = now;
    if (winner.currentMonthVolume < winner.safeVolumeLimit) {
      winner.rotationState = 'ACTIVE_PRIMARY';
    }

    emitMerchantRealtimeEvent(
      env,
      'WALLET_ROTATED',
      {
        provider,
        walletId: winner.id,
        walletNumber: winner.walletNumber,
        currentMonthVolume: winner.currentMonthVolume,
        safeVolumeLimit: winner.safeVolumeLimit,
        monthlyVolumeLimit: winner.monthlyVolumeLimit,
        rotationState: winner.rotationState,
      },
      merchantId
    );
  }

  return winner;
}

/**
 * Returns active rotated wallet map for all supported providers for a merchant.
 */
export async function getAllActiveRotatedWallets(
  db: AppDb,
  merchantId: string,
  env?: Env
): Promise<EnrichedWalletRecord[]> {
  const results: EnrichedWalletRecord[] = [];
  for (const provider of MFS_PROVIDERS) {
    const wallet = await getActiveRotatedWallet(db, merchantId, provider, env);
    if (wallet) {
      results.push(wallet);
    }
  }
  return results;
}

/**
 * Lists all registered wallets for a merchant (enriched with rotation status and device presence).
 */
export async function listWallets(
  db: AppDb,
  merchantId: string
): Promise<EnrichedWalletRecord[]> {
  const [rows, devices] = await Promise.all([
    db
      .select()
      .from(merchantWallets)
      .where(eq(merchantWallets.merchantId, merchantId))
      .orderBy(desc(merchantWallets.isActive), desc(merchantWallets.isPrimary), asc(merchantWallets.priorityOrder)),
    listMerchantDevicesSummary(db, merchantId),
  ]);
  return rows.map((w) => enrichWalletRecord(w, devices));
}

/**
 * Returns complete wallet rotation pool + connected Android devices overview.
 */
export async function getWalletsOverview(
  db: AppDb,
  merchantId: string,
  env?: Env
): Promise<WalletsOverviewResult> {
  const [walletRows, rawDevices, pushStatus] = await Promise.all([
    db
      .select()
      .from(merchantWallets)
      .where(eq(merchantWallets.merchantId, merchantId))
      .orderBy(desc(merchantWallets.isActive), desc(merchantWallets.isPrimary), asc(merchantWallets.priorityOrder)),
    listMerchantDevicesSummary(db, merchantId),
    env?.PUSH_HUB ? getMerchantPushHubStatus(env, merchantId) : Promise.resolve(null),
  ]);

  const hasLiveAndroidSocket = pushStatus
    ? (pushStatus.androidSockets ?? pushStatus.activeSockets) > 0
    : false;
  const devices =
    hasLiveAndroidSocket && rawDevices.length > 0
      ? rawDevices.map((d, idx) => (idx === 0 ? { ...d, isOnline: true } : d))
      : rawDevices;
  const wallets = walletRows.map((w) => enrichWalletRecord(w, devices));

  const activeWallets = wallets.filter((w) => w.isActive && !w.isPlaceholder);
  return {
    wallets,
    devices,
    summary: {
      totalWallets: wallets.length,
      activeWallets: activeWallets.length,
      onlineDeviceCount: devices.filter((d) => d.isOnline).length,
      totalDeviceCount: devices.length,
      overflowWarningCount: activeWallets.filter((w) => w.rotationState === 'SAFE_LIMIT_OVERFLOW').length,
      hardLimitReachedCount: activeWallets.filter((w) => w.rotationState === 'HARD_LIMIT_REACHED').length,
    },
  };
}

/**
 * Creates and registers a new SIM wallet.
 */
export async function createWallet(
  db: AppDb,
  merchantId: string,
  input: CreateWalletInput
): Promise<EnrichedWalletRecord> {
  const id = `wal_${generateSecureToken(16)}`;
  const normalizedNumber = sanitizePhoneNumber(input.walletNumber, input.provider);
  const hardLimit = input.monthlyVolumeLimit || DEFAULT_MAX_VOLUME_LIMIT;
  const safeLimit = Math.min(input.safeVolumeLimit || DEFAULT_SAFE_VOLUME_LIMIT, hardLimit);

  if (input.isPrimary) {
    await db
      .update(merchantWallets)
      .set({ isPrimary: false })
      .where(
        and(
          eq(merchantWallets.merchantId, merchantId),
          eq(merchantWallets.provider, input.provider),
          eq(merchantWallets.isPrimary, true)
        )
      );
  }

  await db.insert(merchantWallets).values({
    id,
    merchantId,
    provider: input.provider,
    accountType: input.accountType,
    walletNumber: normalizedNumber,
    label: input.label ?? null,
    deviceId: input.deviceId ?? null,
    simSlotIndex: input.simSlotIndex ?? null,
    safeVolumeLimit: safeLimit,
    monthlyVolumeLimit: hardLimit,
    currentMonthVolume: 0,
    isPrimary: input.isPrimary,
    isActive: true,
    priorityOrder: input.priorityOrder,
  });

  const [created, devices] = await Promise.all([
    db.select().from(merchantWallets).where(eq(merchantWallets.id, id)).limit(1),
    listMerchantDevicesSummary(db, merchantId),
  ]);
  return enrichWalletRecord(created[0], devices);
}

/**
 * Updates wallet parameters or toggle active/primary states.
 */
export async function updateWallet(
  db: AppDb,
  merchantId: string,
  walletId: string,
  input: UpdateWalletInput
): Promise<EnrichedWalletRecord> {
  const existing = await db
    .select()
    .from(merchantWallets)
    .where(and(eq(merchantWallets.id, walletId), eq(merchantWallets.merchantId, merchantId)))
    .limit(1);

  if (!existing[0]) {
    throw new NotFoundError(`Wallet ${walletId} not found`);
  }

  const current = existing[0];

  if (input.isPrimary) {
    await db
      .update(merchantWallets)
      .set({ isPrimary: false })
      .where(
        and(
          eq(merchantWallets.merchantId, merchantId),
          eq(merchantWallets.provider, current.provider),
          eq(merchantWallets.isPrimary, true)
        )
      );
  }

  const nextMax = input.monthlyVolumeLimit ?? current.monthlyVolumeLimit;
  const nextSafe =
    input.safeVolumeLimit !== undefined
      ? Math.min(input.safeVolumeLimit, nextMax)
      : Math.min(current.safeVolumeLimit || DEFAULT_SAFE_VOLUME_LIMIT, nextMax);

  await db
    .update(merchantWallets)
    .set({
      ...(input.walletNumber !== undefined && {
        walletNumber: sanitizePhoneNumber(input.walletNumber, current.provider),
      }),
      ...(input.accountType !== undefined && { accountType: input.accountType }),
      ...(input.label !== undefined && { label: input.label }),
      ...(input.deviceId !== undefined && { deviceId: input.deviceId }),
      ...(input.simSlotIndex !== undefined && { simSlotIndex: input.simSlotIndex }),
      safeVolumeLimit: nextSafe,
      ...(input.monthlyVolumeLimit !== undefined && { monthlyVolumeLimit: input.monthlyVolumeLimit }),
      ...(input.currentMonthVolume !== undefined && { currentMonthVolume: input.currentMonthVolume }),
      ...(input.isPrimary !== undefined && { isPrimary: input.isPrimary }),
      ...(input.isActive !== undefined && { isActive: input.isActive }),
      ...(input.priorityOrder !== undefined && { priorityOrder: input.priorityOrder }),
    })
    .where(eq(merchantWallets.id, walletId));

  const [updated, devices] = await Promise.all([
    db.select().from(merchantWallets).where(eq(merchantWallets.id, walletId)).limit(1),
    listMerchantDevicesSummary(db, merchantId),
  ]);
  return enrichWalletRecord(updated[0], devices);
}

/**
 * Deletes a wallet.
 */
export async function deleteWallet(db: AppDb, merchantId: string, walletId: string): Promise<void> {
  const existing = await db
    .select()
    .from(merchantWallets)
    .where(and(eq(merchantWallets.id, walletId), eq(merchantWallets.merchantId, merchantId)))
    .limit(1);

  if (!existing[0]) {
    throw new NotFoundError(`Wallet ${walletId} not found`);
  }

  await db.delete(merchantWallets).where(eq(merchantWallets.id, walletId));
}

/**
 * Emits a signed `wallet.synced` or `wallet.rotated` webhook to keep connected storefronts in sync.
 */
export async function dispatchWalletSyncWebhook(
  db: AppDb,
  merchant: MerchantRecord,
  event: 'wallet.rotated' | 'wallet.synced',
  env?: Env,
  extra?: Record<string, unknown>
): Promise<void> {
  if (!merchant.webhookUrl || !merchant.webhookUrl.trim().startsWith('https://')) {
    return;
  }
  const overview = await getWalletsOverview(db, merchant.id);
  await dispatchWebhook(
    db,
    merchant,
    event,
    {
      merchantId: merchant.id,
      wallets: overview.wallets.map((w) => ({
        id: w.id,
        provider: w.provider,
        walletNumber: w.walletNumber,
        accountType: w.accountType,
        label: w.label,
        isActive: w.isActive,
        isPrimary: w.isPrimary,
        isPlaceholder: w.isPlaceholder,
        safeVolumeLimit: w.safeVolumeLimit,
        monthlyVolumeLimit: w.monthlyVolumeLimit,
        currentMonthVolume: w.currentMonthVolume,
        rotationState: w.rotationState,
        deviceId: w.deviceId,
        deviceName: w.deviceName,
        simSlotIndex: w.simSlotIndex,
        deviceOnline: w.deviceOnline,
      })),
      devices: overview.devices,
      summary: overview.summary,
      ...extra,
    },
    1,
    undefined,
    undefined,
    env
  ).catch((err) => {
    console.warn(`[Wallet Webhook] Failed to dispatch ${event}:`, err);
  });
}

/**
 * Increments monthly volume for the wallet associated with a verified transaction,
 * checks 250k safe limit & 300k hard limit thresholds, and triggers auto-rotation if needed.
 */
export async function incrementWalletVolume(
  db: AppDb,
  merchantId: string,
  provider: MfsProvider,
  amount: number,
  walletNumber?: string,
  options?: {
    merchant?: MerchantRecord;
    env?: Env;
  }
): Promise<{ rotated: boolean; activeWallet: EnrichedWalletRecord | null }> {
  let targetWallet: MerchantWalletRecord | null = null;

  if (walletNumber) {
    const normalized = sanitizePhoneNumber(walletNumber, provider);
    const match = await db
      .select()
      .from(merchantWallets)
      .where(
        and(
          eq(merchantWallets.merchantId, merchantId),
          eq(merchantWallets.provider, provider),
          eq(merchantWallets.walletNumber, normalized)
        )
      )
      .limit(1);
    targetWallet = match[0] || null;
  }

  if (!targetWallet) {
    targetWallet = await getActiveRotatedWallet(db, merchantId, provider, options?.env);
  }

  if (!targetWallet) {
    return { rotated: false, activeWallet: null };
  }

  const prevVolume = targetWallet.currentMonthVolume;
  const newVolume = prevVolume + amount;
  const safeLimit =
    targetWallet.safeVolumeLimit > 0 ? targetWallet.safeVolumeLimit : DEFAULT_SAFE_VOLUME_LIMIT;

  await db
    .update(merchantWallets)
    .set({
      currentMonthVolume: sql`${merchantWallets.currentMonthVolume} + ${amount}`,
    })
    .where(eq(merchantWallets.id, targetWallet.id));

  const nextActive = await getActiveRotatedWallet(db, merchantId, provider, options?.env);
  const rotated = Boolean(
    nextActive && (nextActive.id !== targetWallet.id || (prevVolume < safeLimit && newVolume >= safeLimit))
  );

  if (rotated && options?.merchant) {
    await dispatchWalletSyncWebhook(db, options.merchant, 'wallet.rotated', options.env, {
      provider,
      previousWalletNumber: targetWallet.walletNumber,
      newWalletNumber: nextActive?.walletNumber ?? null,
      reason: newVolume >= (targetWallet.monthlyVolumeLimit || DEFAULT_MAX_VOLUME_LIMIT)
        ? 'HARD_LIMIT_300K_REACHED'
        : 'SAFE_LIMIT_250K_REACHED',
    });
  }

  return { rotated, activeWallet: nextActive };
}

/**
 * Synchronizes MFS SIM wallets pushed from a connected storefront or portal.
 * Validates and normalizes numbers, supports multiple accounts per provider with
 * 250k safe limit & 300k hard limit, optionally prunes deleted storefront accounts,
 * and returns enriched wallets + connected devices.
 */
export async function syncMerchantWallets(
  db: AppDb,
  merchantId: string,
  input: SyncWalletsInput,
  env?: Env
): Promise<SyncMerchantWalletsResult> {
  const normalizedItems = input.wallets.map((item, index) => {
    const normalizedNumber = sanitizePhoneNumber(item.walletNumber, item.provider);
    if (!BANGLADESHI_PHONE_REGEX.test(normalizedNumber)) {
      throw new BadRequestError(
        `Invalid ${item.provider} wallet number: ${item.walletNumber}. Must be an 11 or 12-digit Bangladeshi mobile number starting with 01.`
      );
    }

    const hardLimit = item.monthlyVolumeLimit ?? DEFAULT_MAX_VOLUME_LIMIT;
    const safeLimit = Math.min(item.safeVolumeLimit ?? DEFAULT_SAFE_VOLUME_LIMIT, hardLimit);

    return {
      ...item,
      normalizedNumber,
      safeLimit,
      hardLimit,
      priorityOrder: item.priorityOrder ?? index + 1,
    };
  });

  const hasNonPlaceholder = normalizedItems.some(
    (item) => !isPlaceholderWalletNumber(item.normalizedNumber)
  );

  if (input.replacePlaceholders !== false && hasNonPlaceholder) {
    await db
      .delete(merchantWallets)
      .where(
        and(
          eq(merchantWallets.merchantId, merchantId),
          inArray(merchantWallets.walletNumber, Array.from(PLACEHOLDER_WALLET_NUMBERS))
        )
      );
  }

  let syncedCount = 0;

  for (const item of normalizedItems) {
    if (item.isPrimary === true) {
      await db
        .update(merchantWallets)
        .set({ isPrimary: false })
        .where(
          and(
            eq(merchantWallets.merchantId, merchantId),
            eq(merchantWallets.provider, item.provider),
            eq(merchantWallets.isPrimary, true)
          )
        );
    }

    const existing = await db
      .select()
      .from(merchantWallets)
      .where(
        and(
          eq(merchantWallets.merchantId, merchantId),
          eq(merchantWallets.provider, item.provider),
          eq(merchantWallets.walletNumber, item.normalizedNumber)
        )
      )
      .limit(1);

    if (existing[0]) {
      await db
        .update(merchantWallets)
        .set({
          accountType: item.accountType,
          isActive: item.isActive,
          priorityOrder: item.priorityOrder,
          safeVolumeLimit: item.safeLimit,
          monthlyVolumeLimit: item.hardLimit,
          ...(item.label !== undefined && { label: item.label }),
          ...(item.deviceId !== undefined && { deviceId: item.deviceId }),
          ...(item.simSlotIndex !== undefined && { simSlotIndex: item.simSlotIndex }),
          ...(item.isPrimary !== undefined && { isPrimary: item.isPrimary }),
        })
        .where(eq(merchantWallets.id, existing[0].id));
    } else {
      await db.insert(merchantWallets).values({
        id: `wal_${generateSecureToken(16)}`,
        merchantId,
        provider: item.provider,
        accountType: item.accountType,
        walletNumber: item.normalizedNumber,
        label: item.label ?? null,
        deviceId: item.deviceId ?? null,
        simSlotIndex: item.simSlotIndex ?? null,
        safeVolumeLimit: item.safeLimit,
        monthlyVolumeLimit: item.hardLimit,
        currentMonthVolume: 0,
        isPrimary: item.isPrimary ?? false,
        isActive: item.isActive,
        priorityOrder: item.priorityOrder,
      });
    }

    syncedCount++;
  }

  if (input.pruneMissing && normalizedItems.length > 0) {
    const keepKeys = new Set(normalizedItems.map((i) => `${i.provider}:${i.normalizedNumber}`));
    const existingAll = await db
      .select()
      .from(merchantWallets)
      .where(eq(merchantWallets.merchantId, merchantId));
    const toRemoveIds = existingAll
      .filter((w) => !keepKeys.has(`${w.provider}:${sanitizePhoneNumber(w.walletNumber, w.provider)}`))
      .map((w) => w.id);
    if (toRemoveIds.length > 0) {
      await db.delete(merchantWallets).where(inArray(merchantWallets.id, toRemoveIds));
    }
  }

  // Run intelligent rotation check per provider so active primary always honors 250k/300k & device status
  for (const provider of MFS_PROVIDERS) {
    await getActiveRotatedWallet(db, merchantId, provider, env);
  }

  const [allWallets, devices] = await Promise.all([
    listWallets(db, merchantId),
    listMerchantDevicesSummary(db, merchantId),
  ]);

  const placeholderCount = allWallets.filter((w) => w.isPlaceholder).length;
  const activeCount = allWallets.filter((w) => w.isActive && !w.isPlaceholder).length;

  return {
    wallets: allWallets,
    devices,
    syncedCount,
    activeCount,
    placeholderCount,
    hasPlaceholderWallets: placeholderCount > 0,
  };
}
