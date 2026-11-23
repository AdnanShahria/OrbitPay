import { eq, and, desc, sql } from 'drizzle-orm';
import type { AppDb } from '../../db/client';
import {
  merchants,
  merchantDevices,
  smsLedger,
  verificationQueue,
  type MerchantRecord,
  type SmsLedgerRecord,
} from '../../db/schema';
import { generateSecureToken, hashDeviceApiKey } from '../../shared/crypto';
import type { Env } from '../../shared/types';
import { incrementWalletVolume } from '../wallets/wallets.service';
import { dispatchWebhook, sendPushToMerchantDevices } from '../webhooks/webhook.dispatcher';
import { computeMatchType, syncVerifiedOrderAndSession } from '../checkout/checkout.service';
import { realtimeHub } from '../realtime/realtime.service';
import type { IngestMessageDTO } from './device.schema';

export interface IngestBatchResult {
  ingestedCount: number;
  autoVerifiedCount: number;
}

export interface DeviceStatsResult {
  merchantId: string;
  storeName: string;
  isOnline: boolean;
  lastSeenAt: Date | null;
  totalVerifiedVolume: number;
  verifiedCount: number;
  unclaimedCount: number;
  pendingQueueCount: number;
  recentTransactions: SmsLedgerRecord[];
}

/**
 * Ingests a batch of incoming MFS SMS messages from the Android companion app.
 * Deduplicates using unique (merchant_id, trx_id) constraint and triggers
 * the real-time auto-reconciliation loop across the verification queue.
 */
export async function ingestDeviceSmsBatch(
  db: AppDb,
  merchant: MerchantRecord,
  messages: IngestMessageDTO[],
  fcmServerKeyOrEnv?: string | Env
): Promise<IngestBatchResult> {
  let ingestedCount = 0;
  let autoVerifiedCount = 0;

  for (const msg of messages) {
    const normalizedTrxId = msg.trxId.trim().toUpperCase();
    const normalizedSender = msg.senderNumber.replace(/^\+88/, '').replace(/^88/, '').trim();
    const receivedAtDate = msg.receivedAt ? new Date(msg.receivedAt) : new Date();

    // Check if SMS already exists in sms_ledger
    const existing = await db
      .select()
      .from(smsLedger)
      .where(and(eq(smsLedger.merchantId, merchant.id), eq(smsLedger.trxId, normalizedTrxId)))
      .limit(1);

    if (existing[0]) {
      // Already recorded, skip duplicate ingestion
      continue;
    }

    const ledgerId = `sms_${generateSecureToken(16)}`;

    // Insert into sms_ledger as UNCLAIMED
    await db.insert(smsLedger).values({
      id: ledgerId,
      merchantId: merchant.id,
      provider: msg.provider,
      trxId: normalizedTrxId,
      amount: msg.amount,
      senderNumber: normalizedSender,
      rawSms: msg.rawSms,
      status: 'UNCLAIMED',
      smsReceivedAt: receivedAtDate,
    });

    ingestedCount++;

    // AUTO-RECONCILIATION LOOP: Check if any order is waiting in verification_queue
    // Supports baseAmount fallback: msg.amount >= COALESCE(base_amount, expected_amount) - 0.001
    const pendingMatches = await db
      .select()
      .from(verificationQueue)
      .where(
        and(
          eq(verificationQueue.merchantId, merchant.id),
          eq(verificationQueue.submittedTrxId, normalizedTrxId),
          eq(verificationQueue.status, 'WAITING_FOR_SMS'),
          sql`COALESCE(${verificationQueue.baseAmount}, ${verificationQueue.expectedAmount}) <= ${msg.amount + 0.001}`
        )
      )
      .limit(1);

    const pendingQueueRecord = pendingMatches[0];

    if (pendingQueueRecord) {
      const verifiedTime = new Date();
      const effectiveBaseAmount =
        pendingQueueRecord.baseAmount ?? pendingQueueRecord.expectedAmount;
      const effectiveUniqueAmount =
        pendingQueueRecord.uniqueAmount ?? pendingQueueRecord.expectedAmount;
      const matchType = computeMatchType(
        msg.amount,
        effectiveBaseAmount,
        effectiveUniqueAmount
      );

      // 1. Mark verification_queue as MATCHED
      await db
        .update(verificationQueue)
        .set({ status: 'MATCHED' })
        .where(eq(verificationQueue.id, pendingQueueRecord.id));

      // 2. Mark sms_ledger as VERIFIED with matchType
      await db
        .update(smsLedger)
        .set({
          status: 'VERIFIED',
          matchType,
          externalOrderId: pendingQueueRecord.externalOrderId,
          verifiedAt: verifiedTime,
        })
        .where(eq(smsLedger.id, ledgerId));

      // 3. Sync checkout_sessions and merchant_orders
      await syncVerifiedOrderAndSession(db, {
        merchantId: merchant.id,
        externalOrderId: pendingQueueRecord.externalOrderId,
        baseAmount: effectiveBaseAmount,
        uniqueAmount: effectiveUniqueAmount,
        paidAmount: msg.amount,
        trxId: normalizedTrxId,
        matchType,
        customerEmail: pendingQueueRecord.customerEmail,
        customerPhone: pendingQueueRecord.submittedSender,
      });

      // 4. Increment SIM wallet monthly volume
      await incrementWalletVolume(db, merchant.id, msg.provider, msg.amount);

      // 5. Asynchronously dispatch storefront HMAC webhook
      const webhookPayload = {
        merchantId: merchant.id,
        externalOrderId: pendingQueueRecord.externalOrderId,
        provider: msg.provider,
        trxId: normalizedTrxId,
        amount: msg.amount,
        baseAmount: effectiveBaseAmount,
        uniqueAmount: effectiveUniqueAmount,
        paidAmount: msg.amount,
        matchType,
        senderNumber: normalizedSender,
        status: 'VERIFIED',
        verifiedAt: verifiedTime.getTime(),
      };

      dispatchWebhook(db, merchant, 'payment.verified', webhookPayload).catch((err) => {
        console.error('[Auto-Reconciliation Webhook Error]:', err);
      });

      realtimeHub.broadcast('PAYMENT_VERIFIED', {
        orderId: pendingQueueRecord.externalOrderId,
        trxId: normalizedTrxId,
        amount: msg.amount,
        baseAmount: effectiveBaseAmount,
        uniqueAmount: effectiveUniqueAmount,
        matchType,
        provider: msg.provider,
      });

      // 6. Notify all registered merchant Android devices via FCM
      sendPushToMerchantDevices(
        db,
        fcmServerKeyOrEnv,
        merchant,
        'Auto-Reconciliation Match',
        `Order #${pendingQueueRecord.externalOrderId} verified (৳${msg.amount} via ${msg.provider})`,
        {
          orderId: pendingQueueRecord.externalOrderId,
          trxId: normalizedTrxId,
          status: 'VERIFIED',
          matchType,
        }
      ).catch((err) => {
        console.warn('[FCM Push Error]:', err);
      });

      autoVerifiedCount++;
    }
  }

  return {
    ingestedCount,
    autoVerifiedCount,
  };
}

/**
 * Computes telemetry and transaction analytics for the device & dashboard.
 */
export async function getDeviceStats(db: AppDb, merchantId: string): Promise<DeviceStatsResult> {
  const merchantRes = await db.select().from(merchants).where(eq(merchants.id, merchantId)).limit(1);
  const merchant = merchantRes[0];

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  // Recent 50 transactions
  const recentTransactions = await db
    .select()
    .from(smsLedger)
    .where(eq(smsLedger.merchantId, merchantId))
    .orderBy(desc(smsLedger.smsReceivedAt))
    .limit(50);

  // Compute stats via SQL aggregation
  const volumeResult = await db
    .select({
      sumAmount: sql<number>`COALESCE(SUM(${smsLedger.amount}), 0)`,
      verifiedCount: sql<number>`COALESCE(COUNT(CASE WHEN ${smsLedger.status} IN ('VERIFIED', 'MANUAL_VERIFIED') THEN 1 END), 0)`,
      unclaimedCount: sql<number>`COALESCE(COUNT(CASE WHEN ${smsLedger.status} = 'UNCLAIMED' THEN 1 END), 0)`,
    })
    .from(smsLedger)
    .where(
      and(
        eq(smsLedger.merchantId, merchantId),
        sql`${smsLedger.smsReceivedAt} >= ${Math.floor(startOfMonth.getTime() / 1000)}`
      )
    );

  const pendingQueueResult = await db
    .select({
      count: sql<number>`COALESCE(COUNT(*), 0)`,
    })
    .from(verificationQueue)
    .where(and(eq(verificationQueue.merchantId, merchantId), eq(verificationQueue.status, 'WAITING_FOR_SMS')));

  const lastSeenMs = merchant?.lastSeenAt ? merchant.lastSeenAt.getTime() : 0;
  const isOnline = Date.now() - lastSeenMs < 5 * 60 * 1000; // 5-minute online threshold

  return {
    merchantId,
    storeName: merchant?.storeName || 'ORBIT Store',
    isOnline,
    lastSeenAt: merchant?.lastSeenAt || null,
    totalVerifiedVolume: Number(volumeResult[0]?.sumAmount || 0),
    verifiedCount: Number(volumeResult[0]?.verifiedCount || 0),
    unclaimedCount: Number(volumeResult[0]?.unclaimedCount || 0),
    pendingQueueCount: Number(pendingQueueResult[0]?.count || 0),
    recentTransactions,
  };
}

/**
 * Updates device heartbeat and companion app FCM push registration token.
 */
export async function recordDeviceHeartbeat(
  db: AppDb,
  merchantId: string,
  fcmToken?: string,
  rawDeviceKey?: string,
  pepper = ''
): Promise<void> {
  const now = new Date();
  const updateData: { lastSeenAt: Date; fcmToken?: string } = {
    lastSeenAt: now,
  };

  if (fcmToken) {
    updateData.fcmToken = fcmToken;
  }

  await db.update(merchants).set(updateData).where(eq(merchants.id, merchantId));

  if (rawDeviceKey) {
    const keyHash = await hashDeviceApiKey(rawDeviceKey.trim(), pepper);
    await db
      .update(merchantDevices)
      .set(fcmToken ? { lastSeenAt: now, fcmToken } : { lastSeenAt: now })
      .where(
        and(
          eq(merchantDevices.merchantId, merchantId),
          eq(merchantDevices.deviceKeyHash, keyHash),
          eq(merchantDevices.isActive, true)
        )
      );
  }
}
