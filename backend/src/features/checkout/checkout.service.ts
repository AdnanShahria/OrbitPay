import { eq, and, gt, inArray, desc } from 'drizzle-orm';
import type { AppDb } from '../../db/client';
import {
  merchants,
  smsLedger,
  verificationQueue,
  checkoutSessions,
  merchantOrders,
  type MerchantRecord,
  type MfsProvider,
  type MatchType,
} from '../../db/schema';
import { createSignedSessionToken, generateSecureToken } from '../../shared/crypto';
import { NotFoundError, BadRequestError } from '../../shared/errors';
import type { Env } from '../../shared/types';
import {
  getAllActiveRotatedWallets,
  getActiveRotatedWallet,
  incrementWalletVolume,
} from '../wallets/wallets.service';
import { dispatchWebhook, sendPushToMerchantDevices } from '../webhooks/webhook.dispatcher';
import type { VerifyCheckoutInput } from './checkout.schema';

const SESSION_TTL_MS = 60 * 60 * 1000;

export interface CheckoutSessionResult {
  sessionId: string;
  sessionToken: string;
  merchantId: string;
  orderId: string;
  storeName: string;
  baseAmount: number;
  uniqueAmount: number;
  expectedAmount: number;
  offsetCents: number;
  expiresAt: Date;
  activeWallets: {
    provider: MfsProvider;
    walletNumber: string;
    accountType: string;
    isPrimary: boolean;
  }[];
}

export interface VerifyResult {
  status: 'VERIFIED' | 'PENDING_VERIFICATION';
  trxId?: string;
  amount?: number;
  baseAmount?: number;
  uniqueAmount?: number;
  paidAmount?: number;
  matchType?: MatchType;
  provider?: string;
  message?: string;
  expiresAt?: Date;
}

/**
 * Determines whether the received SMS amount matched the unique poisha amount,
 * fell back to the base amount, or was overpaid.
 */
export function computeMatchType(
  smsAmount: number,
  baseAmount: number,
  uniqueAmount: number
): MatchType {
  if (Math.abs(smsAmount - uniqueAmount) < 0.001) {
    return 'EXACT_UNIQUE';
  }
  if (Math.abs(smsAmount - baseAmount) < 0.001) {
    return 'BASE_AMOUNT_FALLBACK';
  }
  return 'OVERPAID';
}

/**
 * Upserts a verified MFS payment into merchant_orders and closes active checkout_sessions.
 */
export async function syncVerifiedOrderAndSession(
  db: AppDb,
  params: {
    merchantId: string;
    externalOrderId: string;
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
        inArray(checkoutSessions.status, ['OPEN', 'SUBMITTED'])
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

/**
 * Creates (or idempotently reuses) a checkout session with a positive 2-decimal poisha uniqueAmount
 * and returns active rotated wallets.
 */
export async function createCheckoutSession(
  db: AppDb,
  merchantId: string,
  orderId: string,
  amount: number,
  customerEmail: string,
  requestedProvider?: MfsProvider
): Promise<CheckoutSessionResult> {
  if (amount <= 0) {
    throw new BadRequestError('Payment amount must be greater than zero');
  }

  const baseAmount = Math.round(amount * 100) / 100;

  const merchantRes = await db
    .select()
    .from(merchants)
    .where(and(eq(merchants.id, merchantId), eq(merchants.isActive, true)))
    .limit(1);

  const merchant = merchantRes[0];
  if (!merchant) {
    throw new NotFoundError(`Active merchant '${merchantId}' not found`);
  }

  // Retrieve rotated active wallets
  let wallets = await getAllActiveRotatedWallets(db, merchantId);

  if (requestedProvider) {
    const specific = await getActiveRotatedWallet(db, merchantId, requestedProvider);
    if (specific) {
      wallets = [specific];
    }
  }

  if (wallets.length === 0) {
    throw new BadRequestError('No active SIM wallets configured for this merchant');
  }

  const now = new Date();

  // Reuse existing active OPEN/SUBMITTED session for (merchantId, orderId) with matching baseAmount
  const existingSessions = await db
    .select()
    .from(checkoutSessions)
    .where(
      and(
        eq(checkoutSessions.merchantId, merchantId),
        eq(checkoutSessions.externalOrderId, orderId),
        inArray(checkoutSessions.status, ['OPEN', 'SUBMITTED']),
        gt(checkoutSessions.expiresAt, now)
      )
    )
    .orderBy(desc(checkoutSessions.createdAt))
    .limit(1);

  const reusable = existingSessions[0];
  let sessionId: string;
  let uniqueAmount: number;
  let offsetCents: number;
  let expiresAt: Date;

  if (reusable && Math.abs(reusable.baseAmount - baseAmount) < 0.001) {
    sessionId = reusable.id;
    uniqueAmount = reusable.uniqueAmount;
    offsetCents = reusable.offsetCents;
    expiresAt = reusable.expiresAt;
  } else {
    // Query active reservations for same merchant & baseAmount to reserve smallest unused positive offsetCents >= 1
    const activeReservations = await db
      .select({ offsetCents: checkoutSessions.offsetCents })
      .from(checkoutSessions)
      .where(
        and(
          eq(checkoutSessions.merchantId, merchantId),
          eq(checkoutSessions.baseAmount, baseAmount),
          inArray(checkoutSessions.status, ['OPEN', 'SUBMITTED']),
          gt(checkoutSessions.expiresAt, now)
        )
      );

    const usedOffsets = new Set(activeReservations.map((r) => r.offsetCents));
    offsetCents = 1;
    while (usedOffsets.has(offsetCents)) {
      offsetCents++;
    }

    // Positive 2-decimal poisha amount (e.g. 50 + 0.01 = 50.01)
    uniqueAmount = Math.round(baseAmount * 100 + offsetCents) / 100;
    expiresAt = new Date(now.getTime() + SESSION_TTL_MS);
    sessionId = `chk_${generateSecureToken(16)}`;

    await db.insert(checkoutSessions).values({
      id: sessionId,
      merchantId,
      externalOrderId: orderId,
      customerEmail,
      baseAmount,
      uniqueAmount,
      offsetCents,
      provider: requestedProvider || null,
      status: 'OPEN',
      expiresAt,
      createdAt: now,
    });
  }

  // Generate signed tamper-evident session token
  const sessionToken = await createSignedSessionToken(
    {
      sessionId,
      merchantId,
      orderId,
      baseAmount,
      uniqueAmount,
      offsetCents,
      amount: uniqueAmount,
      customerEmail,
      exp: expiresAt.getTime(),
    },
    merchant.webhookSecret
  );

  return {
    sessionId,
    sessionToken,
    merchantId,
    orderId,
    storeName: merchant.storeName,
    baseAmount,
    uniqueAmount,
    expectedAmount: uniqueAmount,
    offsetCents,
    expiresAt,
    activeWallets: wallets.map((w) => ({
      provider: w.provider,
      walletNumber: w.walletNumber,
      accountType: w.accountType,
      isPrimary: w.isPrimary,
    })),
  };
}

/**
 * Verifies submitted checkout payment via Instant Match against sms_ledger
 * (supporting both exact uniqueAmount and baseAmount fallback), or queues into verification_queue.
 */
export async function verifyCheckoutPayment(
  db: AppDb,
  merchant: MerchantRecord,
  payload: VerifyCheckoutInput,
  fcmServerKeyOrEnv?: string | Env
): Promise<VerifyResult> {
  const submittedTrxId = payload.trxId.trim().toUpperCase();
  const submittedSender = payload.senderNumber.replace(/^\+88/, '').replace(/^88/, '').trim();
  const submittedAmount = payload.paidAmount ?? payload.amount!;
  const now = new Date();

  // Resolve canonical baseAmount & uniqueAmount from active checkout_sessions if available
  const sessionRes = await db
    .select()
    .from(checkoutSessions)
    .where(
      and(
        eq(checkoutSessions.merchantId, merchant.id),
        eq(checkoutSessions.externalOrderId, payload.orderId),
        inArray(checkoutSessions.status, ['OPEN', 'SUBMITTED']),
        gt(checkoutSessions.expiresAt, now)
      )
    )
    .orderBy(desc(checkoutSessions.createdAt))
    .limit(1);

  const activeSession = sessionRes[0];
  const effectiveBaseAmount = activeSession?.baseAmount ?? payload.baseAmount ?? submittedAmount;
  const effectiveUniqueAmount = activeSession?.uniqueAmount ?? submittedAmount;

  // 1. Instant Match Flow: Check incoming UNCLAIMED sms_ledger by TrxID
  const existingLedgerRecords = await db
    .select()
    .from(smsLedger)
    .where(
      and(
        eq(smsLedger.merchantId, merchant.id),
        eq(smsLedger.trxId, submittedTrxId),
        eq(smsLedger.status, 'UNCLAIMED')
      )
    )
    .limit(1);

  const matchedSms = existingLedgerRecords[0];

  if (matchedSms) {
    if (matchedSms.amount < effectiveBaseAmount - 0.001) {
      throw new BadRequestError(
        `Received amount ৳${matchedSms.amount} is below order amount ৳${effectiveBaseAmount}`
      );
    }

    const matchType = computeMatchType(
      matchedSms.amount,
      effectiveBaseAmount,
      effectiveUniqueAmount
    );

    // Mark sms_ledger as VERIFIED with matchType
    await db
      .update(smsLedger)
      .set({
        status: 'VERIFIED',
        matchType,
        externalOrderId: payload.orderId,
        verifiedAt: now,
      })
      .where(eq(smsLedger.id, matchedSms.id));

    // Update wallet volume
    await incrementWalletVolume(db, merchant.id, matchedSms.provider, matchedSms.amount);

    // If an entry existed in verification_queue, mark it MATCHED
    await db
      .update(verificationQueue)
      .set({ status: 'MATCHED' })
      .where(
        and(
          eq(verificationQueue.merchantId, merchant.id),
          eq(verificationQueue.submittedTrxId, submittedTrxId),
          eq(verificationQueue.status, 'WAITING_FOR_SMS')
        )
      );

    // Sync checkout_sessions and merchant_orders
    await syncVerifiedOrderAndSession(db, {
      merchantId: merchant.id,
      externalOrderId: payload.orderId,
      baseAmount: effectiveBaseAmount,
      uniqueAmount: effectiveUniqueAmount,
      paidAmount: matchedSms.amount,
      trxId: submittedTrxId,
      matchType,
      customerEmail: payload.customerEmail || activeSession?.customerEmail,
      customerPhone: submittedSender,
    });

    // Asynchronously dispatch storefront HMAC webhook
    const verifiedData = {
      merchantId: merchant.id,
      externalOrderId: payload.orderId,
      provider: matchedSms.provider,
      trxId: submittedTrxId,
      amount: matchedSms.amount,
      baseAmount: effectiveBaseAmount,
      uniqueAmount: effectiveUniqueAmount,
      paidAmount: matchedSms.amount,
      matchType,
      senderNumber: matchedSms.senderNumber,
      status: 'VERIFIED',
      verifiedAt: now.getTime(),
    };

    dispatchWebhook(db, merchant, 'payment.verified', verifiedData).catch((err) => {
      console.error('[Instant Match Webhook Dispatch Error]:', err);
    });

    // Notify Android companion devices via FCM
    sendPushToMerchantDevices(
      db,
      fcmServerKeyOrEnv,
      merchant,
      'Payment Verified',
      `Order #${payload.orderId} verified (৳${matchedSms.amount} via ${matchedSms.provider})`,
      {
        orderId: payload.orderId,
        trxId: submittedTrxId,
        status: 'VERIFIED',
        matchType,
      }
    ).catch((err) => {
      console.warn('[FCM Push Error]:', err);
    });

    return {
      status: 'VERIFIED',
      trxId: submittedTrxId,
      amount: matchedSms.amount,
      baseAmount: effectiveBaseAmount,
      uniqueAmount: effectiveUniqueAmount,
      paidAmount: matchedSms.amount,
      matchType,
      provider: matchedSms.provider,
    };
  }

  // 2. Deferred Queue Flow: Check if already queued
  const existingQueue = await db
    .select()
    .from(verificationQueue)
    .where(
      and(
        eq(verificationQueue.merchantId, merchant.id),
        eq(verificationQueue.submittedTrxId, submittedTrxId),
        eq(verificationQueue.status, 'WAITING_FOR_SMS')
      )
    )
    .limit(1);

  if (existingQueue[0]) {
    return {
      status: 'PENDING_VERIFICATION',
      message: 'Verification already queued. Confirmation will dispatch automatically.',
      expiresAt: existingQueue[0].expiresAt,
    };
  }

  // Insert into verification_queue with grace period
  const graceMinutes = merchant.gracePeriodMinutes || 60;
  const expiresAt = new Date(Date.now() + graceMinutes * 60 * 1000);
  const queueId = `que_${generateSecureToken(16)}`;

  await db.insert(verificationQueue).values({
    id: queueId,
    merchantId: merchant.id,
    provider: payload.provider,
    externalOrderId: payload.orderId,
    customerEmail: payload.customerEmail || activeSession?.customerEmail || 'buyer@orbitsaas.cloud',
    expectedAmount: effectiveBaseAmount,
    baseAmount: effectiveBaseAmount,
    uniqueAmount: effectiveUniqueAmount,
    submittedAmount,
    submittedTrxId,
    submittedSender,
    status: 'WAITING_FOR_SMS',
    expiresAt,
  });

  // Transition active OPEN checkout session to SUBMITTED
  if (activeSession && activeSession.status === 'OPEN') {
    await db
      .update(checkoutSessions)
      .set({ status: 'SUBMITTED', provider: payload.provider })
      .where(eq(checkoutSessions.id, activeSession.id));
  }

  return {
    status: 'PENDING_VERIFICATION',
    message: 'Verification queued. Confirmation will be sent automatically once SMS arrives.',
    expiresAt,
  };
}

/**
 * Checks verification status by order ID (used for polling loops).
 */
export async function getCheckoutStatus(
  db: AppDb,
  merchantId: string,
  orderId: string
): Promise<{
  status: string;
  trxId?: string;
  amount?: number;
  matchType?: string | null;
  verifiedAt?: Date;
}> {
  // Check sms_ledger for completed verification
  const verifiedLedger = await db
    .select()
    .from(smsLedger)
    .where(
      and(
        eq(smsLedger.merchantId, merchantId),
        eq(smsLedger.externalOrderId, orderId)
      )
    )
    .limit(1);

  if (
    verifiedLedger[0] &&
    (verifiedLedger[0].status === 'VERIFIED' || verifiedLedger[0].status === 'MANUAL_VERIFIED')
  ) {
    return {
      status: 'VERIFIED',
      trxId: verifiedLedger[0].trxId,
      amount: verifiedLedger[0].amount,
      matchType: verifiedLedger[0].matchType,
      verifiedAt: verifiedLedger[0].verifiedAt || undefined,
    };
  }

  // Check verification queue
  const queueItem = await db
    .select()
    .from(verificationQueue)
    .where(
      and(
        eq(verificationQueue.merchantId, merchantId),
        eq(verificationQueue.externalOrderId, orderId)
      )
    )
    .orderBy(desc(verificationQueue.createdAt))
    .limit(1);

  if (queueItem[0]) {
    if (queueItem[0].status === 'MATCHED') {
      return { status: 'VERIFIED' };
    }
    if (queueItem[0].expiresAt.getTime() < Date.now()) {
      return { status: 'EXPIRED' };
    }
    return { status: 'PENDING_VERIFICATION' };
  }

  return { status: 'UNINITIALIZED' };
}
