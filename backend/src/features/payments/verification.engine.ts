import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { AppDb } from '../../db/client';
import {
  checkoutSessions,
  consumedTrxIds,
  merchantDevices,
  merchantOrders,
  paymentIntents,
  smsLedger,
  type EscalationReason,
  type MatchType,
  type MerchantRecord,
  type MfsProvider,
  type PaymentIntentRecord,
  type ResolutionSource,
  type SmsLedgerRecord,
} from '../../db/schema';
import { getMerchantPushHubStatus } from '../../router/push-hub';
import { generateSecureToken } from '../../shared/crypto';
import { ConflictError } from '../../shared/errors';
import { parseMfsSms, sanitizePhoneNumber } from '../../shared/parsers/mfs';
import { evaluateSmsTrust } from '../../shared/sms-trust';
import type { Env } from '../../shared/types';
import type { DynamicPushAction } from '../webhooks/webhook.dispatcher';

export const DEVICE_ONLINE_THRESHOLD_MS = 5 * 60 * 1000;
const FRESHNESS_BEFORE_SESSION_MS = 30 * 60 * 1000;
const FRESHNESS_FUTURE_SKEW_MS = 5 * 60 * 1000;
const FRESHNESS_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export interface DisplayPayload {
  appName?: string;
  appDomain?: string;
  category?: string;
  referenceLabel?: string;
  title?: string;
  subtitle?: string;
  highlights?: Array<{ label: string; value: string }>;
  adminDeepLink?: string;
}

export interface DeviceStatusSnapshot {
  online: boolean;
  lastSeenAt: Date | null;
  activeSockets: number;
}

export type SixFactorResult =
  | { ok: true; matchType: MatchType }
  | { ok: false; escalationReason: EscalationReason; reason: string };

/**
 * Validates provider-specific Transaction ID format.
 */
export function isValidProviderTrxId(provider: MfsProvider, trxId: string): boolean {
  const normalized = trxId.trim().toUpperCase();
  if (provider === 'BKASH') {
    return /^[A-Z0-9]{8,16}$/.test(normalized);
  }
  return /^[A-Z0-9]{6,20}$/.test(normalized);
}

/**
 * Computes live Android Companion online status using the 5-minute heartbeat window
 * across both `merchants.last_seen_at` and active `merchant_devices.last_seen_at`,
 * plus active Durable Object Android companion WebSocket connections only.
 */
export async function computeDeviceOnlineStatus(
  db: AppDb,
  env: Env | undefined,
  merchant: Pick<MerchantRecord, 'id' | 'lastSeenAt'>
): Promise<DeviceStatusSnapshot> {
  const [deviceAgg, pushStatus] = await Promise.all([
    db
      .select({
        maxLastSeen: sql<number | null>`MAX(${merchantDevices.lastSeenAt})`,
      })
      .from(merchantDevices)
      .where(and(eq(merchantDevices.merchantId, merchant.id), eq(merchantDevices.isActive, true))),
    env
      ? getMerchantPushHubStatus(env, merchant.id)
      : Promise.resolve({ configured: false, activeSockets: 0, androidSockets: 0, webSockets: 0 }),
  ]);

  const merchantMs = merchant.lastSeenAt ? merchant.lastSeenAt.getTime() : 0;
  const rawDeviceVal = deviceAgg[0]?.maxLastSeen;
  let deviceMs = 0;
  if (typeof rawDeviceVal === 'number' && rawDeviceVal > 0) {
    // Drizzle timestamp columns in SQLite are stored as integer seconds
    deviceMs = rawDeviceVal < 10_000_000_000 ? rawDeviceVal * 1000 : rawDeviceVal;
  }

  const maxMs = Math.max(merchantMs, deviceMs);
  const lastSeenAt = maxMs > 0 ? new Date(maxMs) : null;
  const recentHeartbeat = maxMs > 0 && Date.now() - maxMs < DEVICE_ONLINE_THRESHOLD_MS;
  const androidSocketCount = pushStatus.androidSockets ?? pushStatus.activeSockets;

  return {
    online: recentHeartbeat || androidSocketCount > 0,
    lastSeenAt,
    activeSockets: androidSocketCount,
  };
}

/**
 * Evaluates all 5 deterministic anti-wrong-payment factors (F1-F5) before atomic CAS (F6).
 */
export function evaluateSixFactors(params: {
  sms: SmsLedgerRecord;
  merchant: Pick<MerchantRecord, 'allowBaseAmountFallback'>;
  submittedProvider: MfsProvider;
  submittedSender: string;
  baseAmount: number;
  uniqueAmount: number;
  sessionCreatedAt: Date;
  now?: Date;
}): SixFactorResult {
  const now = params.now ?? new Date();
  const { sms, merchant, submittedProvider, baseAmount, uniqueAmount, sessionCreatedAt } = params;

  // F1: Trusted Sender & Server Re-Parse
  if (sms.trustFlag !== null) {
    return {
      ok: false,
      escalationReason: 'TRUST_FLAG_ANOMALY',
      reason: `SMS flagged by anti-spoofing shield (${sms.trustFlag})`,
    };
  }

  const recheckFlag = evaluateSmsTrust({
    provider: sms.provider,
    trxId: sms.trxId,
    amount: sms.amount,
    rawSms: sms.rawSms,
    smsSender: sms.smsSender,
    source: sms.source,
  });

  if (recheckFlag !== null) {
    return {
      ok: false,
      escalationReason: 'TRUST_FLAG_ANOMALY',
      reason: `Server SMS re-verification failed (${recheckFlag})`,
    };
  }

  const parsed = parseMfsSms(sms.rawSms, sms.smsSender ?? undefined);
  if (
    !parsed ||
    parsed.provider !== sms.provider ||
    parsed.trxId !== sms.trxId.trim().toUpperCase() ||
    Math.abs(parsed.amount - sms.amount) > 0.009
  ) {
    return {
      ok: false,
      escalationReason: 'TRUST_FLAG_ANOMALY',
      reason: 'Server SMS re-parse mismatch',
    };
  }

  // F2: Exact Provider Match
  if (sms.provider !== submittedProvider) {
    return {
      ok: false,
      escalationReason: 'TRUST_FLAG_ANOMALY',
      reason: `Provider mismatch: SMS is ${sms.provider}, submitted ${submittedProvider}`,
    };
  }

  // F3: Strict Normalized 11-digit BD Sender Number Match
  const normalizedSmsSender = sanitizePhoneNumber(sms.senderNumber, sms.provider);
  const normalizedSubmittedSender = sanitizePhoneNumber(params.submittedSender, submittedProvider);
  if (!normalizedSmsSender || normalizedSmsSender !== normalizedSubmittedSender) {
    return {
      ok: false,
      escalationReason: 'SENDER_MISMATCH',
      reason: `Sender number mismatch: SMS from ${normalizedSmsSender || 'unknown'}, submitted ${normalizedSubmittedSender}`,
    };
  }

  // F4: Exact Amount Policy (No Arbitrary Overpay Auto-Verify)
  if (sms.amount < baseAmount - 0.001) {
    return {
      ok: false,
      escalationReason: 'UNDERPAID_AMOUNT',
      reason: `Underpaid amount: received ৳${sms.amount}, minimum base ৳${baseAmount}`,
    };
  }

  let matchType: MatchType | null = null;
  if (Math.abs(sms.amount - uniqueAmount) < 0.001) {
    matchType = 'EXACT_UNIQUE';
  } else if (Math.abs(sms.amount - baseAmount) < 0.001) {
    if (merchant.allowBaseAmountFallback) {
      matchType = 'BASE_AMOUNT_FALLBACK';
    } else {
      return {
        ok: false,
        escalationReason: 'UNDERPAID_AMOUNT',
        reason: `Base amount fallback disabled: received ৳${sms.amount}, exact unique ৳${uniqueAmount} required`,
      };
    }
  } else if (sms.amount > uniqueAmount + 0.01 || sms.amount > baseAmount + 0.99) {
    return {
      ok: false,
      escalationReason: 'OVERPAID_AMOUNT_MISMATCH',
      reason: `Overpaid amount mismatch: received ৳${sms.amount}, expected unique ৳${uniqueAmount}`,
    };
  } else if (sms.amount < uniqueAmount - 0.001) {
    return {
      ok: false,
      escalationReason: 'UNDERPAID_AMOUNT',
      reason: `Partial amount mismatch: received ৳${sms.amount}, expected unique ৳${uniqueAmount}`,
    };
  } else {
    return {
      ok: false,
      escalationReason: 'OVERPAID_AMOUNT_MISMATCH',
      reason: `Amount mismatch: received ৳${sms.amount}, expected unique ৳${uniqueAmount}`,
    };
  }

  // F5: Freshness Window ([session.createdAt - 30 min, now + 5 min] and < 24h old)
  const smsMs = sms.smsReceivedAt.getTime();
  const nowMs = now.getTime();
  const minAllowedMs = sessionCreatedAt.getTime() - FRESHNESS_BEFORE_SESSION_MS;
  const maxAllowedMs = nowMs + FRESHNESS_FUTURE_SKEW_MS;
  const maxAgeMs = nowMs - FRESHNESS_MAX_AGE_MS;

  if (smsMs < minAllowedMs || smsMs > maxAllowedMs || smsMs < maxAgeMs) {
    return {
      ok: false,
      escalationReason: 'STALE_SMS_TIMESTAMP',
      reason: 'SMS timestamp falls outside allowed freshness window',
    };
  }

  return { ok: true, matchType };
}

/**
 * Factor 6: Atomically claims an SMS ledger row, records global TrxID consumption,
 * and transitions the payment intent (if present) using stateVersion CAS.
 */
export async function executeAtomicVerificationCas(
  db: AppDb,
  params: {
    merchantId: string;
    smsId: string;
    trxId: string;
    provider: MfsProvider;
    matchType: MatchType;
    externalRefId: string;
    paymentIntent?: PaymentIntentRecord | null;
    resolutionSource: ResolutionSource;
    submittedSender?: string;
    paidAmount?: number;
    receiptAssetId?: string | null;
    receiptUrl?: string | null;
    deviceOnlineAtSubmit?: boolean | null;
    now?: Date;
  }
): Promise<PaymentIntentRecord | null> {
  const now = params.now ?? new Date();
  const normalizedTrxId = params.trxId.trim().toUpperCase();

  // Check consumed_trx_ids first
  const existingConsumed = await db
    .select()
    .from(consumedTrxIds)
    .where(and(eq(consumedTrxIds.merchantId, params.merchantId), eq(consumedTrxIds.trxId, normalizedTrxId)))
    .limit(1);

  if (existingConsumed[0]) {
    throw new ConflictError(`Transaction ID '${normalizedTrxId}' has already been consumed`);
  }

  // Atomic CAS on sms_ledger
  const claimedSms = await db
    .update(smsLedger)
    .set({
      status: 'VERIFIED',
      matchType: params.matchType,
      externalOrderId: params.externalRefId,
      paymentIntentId: params.paymentIntent?.id ?? null,
      verifiedAt: now,
    })
    .where(
      and(
        eq(smsLedger.id, params.smsId),
        eq(smsLedger.merchantId, params.merchantId),
        eq(smsLedger.status, 'UNCLAIMED'),
        isNull(smsLedger.trustFlag)
      )
    )
    .returning({ id: smsLedger.id });

  if (!claimedSms[0]) {
    throw new ConflictError(`SMS ledger row '${params.smsId}' is no longer unclaimed or has a trust flag`);
  }

  // Insert into consumed_trx_ids (PK enforces global single-use across Auto & Manual modes)
  try {
    await db.insert(consumedTrxIds).values({
      merchantId: params.merchantId,
      trxId: normalizedTrxId,
      provider: params.provider,
      paymentIntentId: params.paymentIntent?.id ?? null,
      externalRefId: params.externalRefId,
      resolutionSource: params.resolutionSource,
      consumedAt: now,
    });
  } catch {
    // Revert sms_ledger claim if consumed_trx_ids PK race occurred
    await db
      .update(smsLedger)
      .set({
        status: 'UNCLAIMED',
        matchType: null,
        externalOrderId: null,
        paymentIntentId: null,
        verifiedAt: null,
      })
      .where(eq(smsLedger.id, params.smsId));
    throw new ConflictError(`Transaction ID '${normalizedTrxId}' was concurrently consumed`);
  }

  if (!params.paymentIntent) {
    return null;
  }

  const updatedIntents = await db
    .update(paymentIntents)
    .set({
      status: 'VERIFIED',
      provider: params.provider,
      trxId: normalizedTrxId,
      ...(params.submittedSender ? { senderNumber: params.submittedSender } : {}),
      ...(params.paidAmount !== undefined ? { paidAmount: params.paidAmount } : {}),
      ...(params.receiptAssetId !== undefined ? { receiptAssetId: params.receiptAssetId } : {}),
      ...(params.receiptUrl !== undefined ? { receiptUrl: params.receiptUrl } : {}),
      ...(params.deviceOnlineAtSubmit !== undefined
        ? { deviceOnlineAtSubmit: params.deviceOnlineAtSubmit }
        : {}),
      matchType: params.matchType,
      smsLedgerId: params.smsId,
      smsReconciliationState: 'RECONCILED',
      resolutionSource: params.resolutionSource,
      escalationReason: null,
      stateVersion: params.paymentIntent.stateVersion + 1,
      verifiedAt: now,
      resolvedAt: now,
      updatedAt: now,
    })
    .where(
      and(
        eq(paymentIntents.id, params.paymentIntent.id),
        eq(paymentIntents.stateVersion, params.paymentIntent.stateVersion)
      )
    )
    .returning();

  if (!updatedIntents[0]) {
    throw new ConflictError('Payment intent state changed concurrently during verification');
  }

  return updatedIntents[0];
}

/**
 * Upserts a verified MFS payment into merchant_orders and closes active checkout_sessions.
 */
export async function syncVerifiedOrderAndSession(
  db: AppDb,
  params: {
    merchantId: string;
    externalOrderId: string;
    paymentIntentId?: string | null;
    baseAmount: number;
    uniqueAmount: number;
    paidAmount: number;
    trxId: string;
    matchType: MatchType;
    customerEmail?: string | null;
    customerPhone?: string | null;
  }
): Promise<void> {
  const now = new Date();

  await db
    .update(checkoutSessions)
    .set({ status: 'VERIFIED' })
    .where(
      and(
        eq(checkoutSessions.merchantId, params.merchantId),
        eq(checkoutSessions.externalOrderId, params.externalOrderId),
        inArray(checkoutSessions.status, ['OPEN', 'SUBMITTED', 'ESCALATED'])
      )
    );

  const existingOrder = await db
    .select()
    .from(merchantOrders)
    .where(
      and(
        eq(merchantOrders.merchantId, params.merchantId),
        eq(merchantOrders.externalOrderId, params.externalOrderId)
      )
    )
    .limit(1);

  if (existingOrder[0]) {
    await db
      .update(merchantOrders)
      .set({
        ...(params.paymentIntentId ? { paymentIntentId: params.paymentIntentId } : {}),
        paymentStatus: 'PAID',
        paidAmount: params.paidAmount,
        uniqueAmount: params.uniqueAmount,
        trxId: params.trxId,
        matchType: params.matchType,
        updatedAt: now,
      })
      .where(eq(merchantOrders.id, existingOrder[0].id));
  } else {
    await db.insert(merchantOrders).values({
      id: `ord_${generateSecureToken(12)}`,
      merchantId: params.merchantId,
      paymentIntentId: params.paymentIntentId ?? null,
      externalOrderId: params.externalOrderId,
      customerEmail: params.customerEmail || null,
      customerPhone: params.customerPhone || null,
      paymentMethod: 'ORBIT_MFS',
      paymentStatus: 'PAID',
      orderStatus: 'CONFIRMED',
      baseAmount: params.baseAmount,
      uniqueAmount: params.uniqueAmount,
      paidAmount: params.paidAmount,
      trxId: params.trxId,
      matchType: params.matchType,
      createdAt: now,
      updatedAt: now,
    });
  }
}

export function parseDisplayMetadata(
  displayJson: string | null | undefined,
  fallbackAppName: string,
  externalRefId: string
): DisplayPayload {
  if (!displayJson) {
    return {
      appName: fallbackAppName,
      referenceLabel: 'Order',
      title: `Payment #${externalRefId}`,
    };
  }
  try {
    const parsed = JSON.parse(displayJson) as DisplayPayload;
    return {
      appName: parsed.appName || fallbackAppName,
      appDomain: parsed.appDomain,
      category: parsed.category,
      referenceLabel: parsed.referenceLabel || 'Order',
      title: parsed.title || `Payment #${externalRefId}`,
      subtitle: parsed.subtitle,
      highlights: Array.isArray(parsed.highlights) ? parsed.highlights : undefined,
      adminDeepLink: parsed.adminDeepLink,
    };
  } catch {
    return {
      appName: fallbackAppName,
      referenceLabel: 'Order',
      title: `Payment #${externalRefId}`,
    };
  }
}

export function parseActionsList(actionsJson: string | null | undefined): DynamicPushAction[] {
  if (!actionsJson) return [];
  try {
    const parsed = JSON.parse(actionsJson);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((a) => a && typeof a.id === 'string' && typeof a.label === 'string');
  } catch {
    return [];
  }
}
