import { eq, and, desc, asc, inArray } from 'drizzle-orm';
import type { AppDb } from '../../db/client';
import {
  merchantWallets,
  type MerchantWalletRecord,
  type MfsProvider,
  MFS_PROVIDERS,
} from '../../db/schema';
import { generateSecureToken } from '../../shared/crypto';
import { BadRequestError, NotFoundError } from '../../shared/errors';
import { sanitizePhoneNumber } from '../../shared/parsers/mfs';
import type { CreateWalletInput, SyncWalletsInput, UpdateWalletInput } from './wallets.schema';

const BANGLADESHI_PHONE_REGEX = /^01[3-9]\d{8,9}$/;

export const PLACEHOLDER_WALLET_NUMBERS = new Set(['01700000000', '01800000000']);

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
  wallets: MerchantWalletRecord[];
  syncedCount: number;
  activeCount: number;
  placeholderCount: number;
  hasPlaceholderWallets: boolean;
}

/**
 * Retrieves the optimal active SIM wallet for a provider, honoring the monthly quota rotation.
 * Priority:
 * 1. Under monthly quota limit (currentMonthVolume < monthlyVolumeLimit)
 * 2. Primary designated SIM first (isPrimary = true)
 * 3. Priority order (priorityOrder ASC)
 * 4. Fallback to any active SIM if all are currently over quota
 */
export async function getActiveRotatedWallet(
  db: AppDb,
  merchantId: string,
  provider: MfsProvider
): Promise<MerchantWalletRecord | null> {
  const activeWallets = await db
    .select()
    .from(merchantWallets)
    .where(
      and(
        eq(merchantWallets.merchantId, merchantId),
        eq(merchantWallets.provider, provider),
        eq(merchantWallets.isActive, true)
      )
    )
    .orderBy(desc(merchantWallets.isPrimary), asc(merchantWallets.priorityOrder));

  if (activeWallets.length === 0) {
    return null;
  }

  // Find first SIM strictly under monthly quota
  const underQuotaWallet = activeWallets.find(
    (w) => w.currentMonthVolume < w.monthlyVolumeLimit
  );

  // Return under-quota wallet or gracefully fall back to the primary/first active SIM
  return underQuotaWallet || activeWallets[0];
}

/**
 * Returns active rotated wallet map for all supported providers for a merchant.
 */
export async function getAllActiveRotatedWallets(
  db: AppDb,
  merchantId: string
): Promise<MerchantWalletRecord[]> {
  const results: MerchantWalletRecord[] = [];
  for (const provider of MFS_PROVIDERS) {
    const wallet = await getActiveRotatedWallet(db, merchantId, provider);
    if (wallet) {
      results.push(wallet);
    }
  }
  return results;
}

/**
 * Lists all registered wallets for a merchant.
 */
export async function listWallets(db: AppDb, merchantId: string): Promise<MerchantWalletRecord[]> {
  return db
    .select()
    .from(merchantWallets)
    .where(eq(merchantWallets.merchantId, merchantId))
    .orderBy(desc(merchantWallets.isActive), desc(merchantWallets.isPrimary), asc(merchantWallets.priorityOrder));
}

/**
 * Creates and registers a new SIM wallet.
 */
export async function createWallet(
  db: AppDb,
  merchantId: string,
  input: CreateWalletInput
): Promise<MerchantWalletRecord> {
  const id = `wal_${generateSecureToken(16)}`;

  // If this wallet is marked primary, demote any other primary wallet for the same provider
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
    walletNumber: input.walletNumber,
    monthlyVolumeLimit: input.monthlyVolumeLimit,
    currentMonthVolume: 0,
    isPrimary: input.isPrimary,
    isActive: true,
    priorityOrder: input.priorityOrder,
  });

  const created = await db.select().from(merchantWallets).where(eq(merchantWallets.id, id)).limit(1);
  return created[0];
}

/**
 * Updates wallet parameters or toggle active/primary states.
 */
export async function updateWallet(
  db: AppDb,
  merchantId: string,
  walletId: string,
  input: UpdateWalletInput
): Promise<MerchantWalletRecord> {
  const existing = await db
    .select()
    .from(merchantWallets)
    .where(and(eq(merchantWallets.id, walletId), eq(merchantWallets.merchantId, merchantId)))
    .limit(1);

  if (!existing[0]) {
    throw new NotFoundError(`Wallet ${walletId} not found`);
  }

  const current = existing[0];

  // If setting to primary, demote existing primaries for the same provider
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

  await db
    .update(merchantWallets)
    .set({
      ...(input.walletNumber !== undefined && { walletNumber: input.walletNumber }),
      ...(input.accountType !== undefined && { accountType: input.accountType }),
      ...(input.monthlyVolumeLimit !== undefined && { monthlyVolumeLimit: input.monthlyVolumeLimit }),
      ...(input.currentMonthVolume !== undefined && { currentMonthVolume: input.currentMonthVolume }),
      ...(input.isPrimary !== undefined && { isPrimary: input.isPrimary }),
      ...(input.isActive !== undefined && { isActive: input.isActive }),
      ...(input.priorityOrder !== undefined && { priorityOrder: input.priorityOrder }),
    })
    .where(eq(merchantWallets.id, walletId));

  const updated = await db.select().from(merchantWallets).where(eq(merchantWallets.id, walletId)).limit(1);
  return updated[0];
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
 * Increments monthly volume for the wallet associated with a verified transaction.
 */
export async function incrementWalletVolume(
  db: AppDb,
  merchantId: string,
  provider: MfsProvider,
  amount: number,
  walletNumber?: string
): Promise<void> {
  let targetWallet: MerchantWalletRecord | null = null;

  if (walletNumber) {
    const match = await db
      .select()
      .from(merchantWallets)
      .where(
        and(
          eq(merchantWallets.merchantId, merchantId),
          eq(merchantWallets.provider, provider),
          eq(merchantWallets.walletNumber, walletNumber)
        )
      )
      .limit(1);
    targetWallet = match[0] || null;
  }

  if (!targetWallet) {
    targetWallet = await getActiveRotatedWallet(db, merchantId, provider);
  }

  if (targetWallet) {
    await db
      .update(merchantWallets)
      .set({
        currentMonthVolume: targetWallet.currentMonthVolume + amount,
      })
      .where(eq(merchantWallets.id, targetWallet.id));
  }
}

/**
 * Synchronizes MFS SIM wallets pushed from a connected storefront or portal.
 * Validates and normalizes numbers, optionally removes seeded placeholder numbers,
 * upserts wallets by (merchantId, provider, walletNumber), and enforces single primary per provider.
 */
export async function syncMerchantWallets(
  db: AppDb,
  merchantId: string,
  input: SyncWalletsInput
): Promise<SyncMerchantWalletsResult> {
  const normalizedItems = input.wallets.map((item, index) => {
    const normalizedNumber = sanitizePhoneNumber(item.walletNumber, item.provider);
    if (!BANGLADESHI_PHONE_REGEX.test(normalizedNumber)) {
      throw new BadRequestError(
        `Invalid ${item.provider} wallet number: ${item.walletNumber}. Must be an 11 or 12-digit Bangladeshi mobile number starting with 01.`
      );
    }

    return {
      ...item,
      normalizedNumber,
      priorityOrder: index + 1,
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
          ...(item.isPrimary !== undefined && { isPrimary: item.isPrimary }),
          ...(item.monthlyVolumeLimit !== undefined && {
            monthlyVolumeLimit: item.monthlyVolumeLimit,
          }),
        })
        .where(eq(merchantWallets.id, existing[0].id));
    } else {
      await db.insert(merchantWallets).values({
        id: `wal_${generateSecureToken(16)}`,
        merchantId,
        provider: item.provider,
        accountType: item.accountType,
        walletNumber: item.normalizedNumber,
        monthlyVolumeLimit: item.monthlyVolumeLimit ?? 300000,
        currentMonthVolume: 0,
        isPrimary: item.isPrimary ?? false,
        isActive: item.isActive,
        priorityOrder: item.priorityOrder,
      });
    }

    syncedCount++;
  }

  // Enforce at most one primary per (merchantId, provider), and ensure any provider
  // with active wallets has a primary wallet designated.
  const currentWallets = await listWallets(db, merchantId);
  let primaryAdjusted = false;

  for (const provider of MFS_PROVIDERS) {
    const providerWallets = currentWallets.filter((w) => w.provider === provider);
    if (providerWallets.length === 0) continue;

    const primaries = providerWallets.filter((w) => w.isPrimary);
    if (primaries.length > 1) {
      const demoteIds = primaries.slice(1).map((w) => w.id);
      await db
        .update(merchantWallets)
        .set({ isPrimary: false })
        .where(inArray(merchantWallets.id, demoteIds));
      primaryAdjusted = true;
    } else if (primaries.length === 0) {
      const firstActive = providerWallets.find((w) => w.isActive);
      if (firstActive) {
        await db
          .update(merchantWallets)
          .set({ isPrimary: true })
          .where(eq(merchantWallets.id, firstActive.id));
        primaryAdjusted = true;
      }
    }
  }

  const allWallets = primaryAdjusted ? await listWallets(db, merchantId) : currentWallets;
  const placeholderCount = allWallets.filter((w) =>
    isPlaceholderWalletNumber(w.walletNumber)
  ).length;
  const activeCount = allWallets.filter(
    (w) => w.isActive && !isPlaceholderWalletNumber(w.walletNumber)
  ).length;

  return {
    wallets: allWallets,
    syncedCount,
    activeCount,
    placeholderCount,
    hasPlaceholderWallets: placeholderCount > 0,
  };
}
