import { eq, and, desc, sql, gte, inArray, isNotNull, or } from 'drizzle-orm';
import type { Context } from 'hono';
import type { AppDb } from '../../db/client';
import {
  checkoutSessions,
  consumedTrxIds,
  merchants,
  merchantDevices,
  merchantOrders,
  paymentIntents,
  smsLedger,
  verificationQueue,
  type MerchantRecord,
  type MerchantOrderRecord,
  type MfsProvider,
  type AccountType,
  type SmsLedgerRecord,
  type VerificationMode,
} from '../../db/schema';
import { generateSecureToken, hashDeviceApiKey } from '../../shared/crypto';
import { safeWaitUntil } from '../../shared/middleware';
import { sanitizePhoneNumber } from '../../shared/parsers/mfs';
import { evaluateSmsTrust } from '../../shared/sms-trust';
import type { AppContextEnv, Env } from '../../shared/types';
import {
  computeDeviceOnlineStatus,
  evaluateSixFactors,
  executeAtomicVerificationCas,
  parseActionsList,
  parseDisplayMetadata,
  syncVerifiedOrderAndSession,
} from '../payments/verification.engine';
import {
  incrementWalletVolume,
  isPlaceholderWalletNumber,
  listWallets,
} from '../wallets/wallets.service';
import {
  dispatchWebhook,
  sendDynamicPushToMerchantDevices,
  sendTelegramOfficeAlert,
} from '../webhooks/webhook.dispatcher';
import { realtimeHub } from '../realtime/realtime.service';
import type { IngestMessageDTO, PreflightCheckDTO } from './device.schema';

export interface IngestBatchResult {
  ingestedCount: number;
  autoVerifiedCount: number;
  flaggedCount: number;
}

export interface SyncVerifiedItem {
  trxId: string;
  externalOrderId: string;
  verifiedAt: string;
  amount: number;
  provider: MfsProvider;
}

export interface DeviceSyncResult {
  serverTime: number;
  verified: SyncVerifiedItem[];
  orders: MerchantOrderRecord[];
  pendingConfirmationCount: number;
}

export interface DeviceStatsResult {
  merchantId: string;
  storeName: string;
  isOnline: boolean;
  lastSeenAt: Date | null;
  activeSockets: number;
  totalVerifiedVolume: number;
  verifiedCount: number;
  unclaimedCount: number;
  pendingQueueCount: number;
  recentTransactions: SmsLedgerRecord[];
}

/**
 * Ingests a batch of incoming MFS SMS messages from the Android companion app.
 * Enforces anti-spoofing trust, reconciles late SMS on manually approved intents silently,
 * and runs 6-factor validation + atomic CAS on waiting payments.
 */
export async function ingestDeviceSmsBatch(
  db: AppDb,
  merchant: MerchantRecord,
  messages: IngestMessageDTO[],
  fcmServerKeyOrEnv?: string | Env,
  ctx?: Context<AppContextEnv>
): Promise<IngestBatchResult> {
  const env = typeof fcmServerKeyOrEnv === 'string' ? undefined : fcmServerKeyOrEnv;
  let ingestedCount = 0;
  let autoVerifiedCount = 0;
  let flaggedCount = 0;

  for (const msg of messages) {
    const normalizedTrxId = msg.trxId.trim().toUpperCase();
    const normalizedSender = sanitizePhoneNumber(msg.senderNumber, msg.provider);
    const receivedAtDate = msg.receivedAt ? new Date(msg.receivedAt) : new Date();
    const source = msg.source ?? 'SMS';
    const smsSender = msg.smsSender?.trim() || null;

    const existing = await db
      .select()
      .from(smsLedger)
      .where(and(eq(smsLedger.merchantId, merchant.id), eq(smsLedger.trxId, normalizedTrxId)))
      .limit(1);

    if (existing[0]) {
      continue;
    }

    const trustFlag = evaluateSmsTrust({
      provider: msg.provider,
      trxId: normalizedTrxId,
      amount: msg.amount,
      rawSms: msg.rawSms,
      smsSender,
      source,
    });

    const ledgerId = `sms_${generateSecureToken(16)}`;

    // Check if TrxID was already manually approved prior to SMS arrival
    const consumedRows = await db
      .select()
      .from(consumedTrxIds)
      .where(
        and(eq(consumedTrxIds.merchantId, merchant.id), eq(consumedTrxIds.trxId, normalizedTrxId))
      )
      .limit(1);

    if (consumedRows[0]) {
      const linkedIntentRows = consumedRows[0].paymentIntentId
        ? await db
            .select()
            .from(paymentIntents)
            .where(eq(paymentIntents.id, consumedRows[0].paymentIntentId))
            .limit(1)
        : [];
      const linkedIntent = linkedIntentRows[0];

      await db.insert(smsLedger).values({
        id: ledgerId,
        merchantId: merchant.id,
        provider: msg.provider,
        trxId: normalizedTrxId,
        amount: msg.amount,
        senderNumber: normalizedSender,
        rawSms: msg.rawSms,
        status: 'MANUAL_VERIFIED',
        matchType: 'MANUAL_VERIFIED',
        externalOrderId: linkedIntent?.externalRefId ?? consumedRows[0].externalRefId ?? null,
        paymentIntentId: linkedIntent?.id ?? consumedRows[0].paymentIntentId ?? null,
        smsReceivedAt: receivedAtDate,
        verifiedAt: linkedIntent?.verifiedAt ?? new Date(),
        smsSender,
        source,
        trustFlag,
      });

      if (linkedIntent && linkedIntent.smsReconciliationState === 'PENDING_LATE_SMS') {
        await db
          .update(paymentIntents)
          .set({
            smsLedgerId: ledgerId,
            smsReconciliationState: trustFlag ? 'MISMATCH' : 'RECONCILED',
            updatedAt: new Date(),
          })
          .where(eq(paymentIntents.id, linkedIntent.id));
      }

      ingestedCount++;
      continue;
    }

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
      smsSender,
      source,
      trustFlag,
    });

    ingestedCount++;

    const insertedLedgerRows = await db
      .select()
      .from(smsLedger)
      .where(eq(smsLedger.id, ledgerId))
      .limit(1);
    const ledgerRow = insertedLedgerRows[0];

    if (trustFlag !== null) {
      flaggedCount++;
      realtimeHub.broadcast(
        'SMS_FLAGGED',
        {
          trxId: normalizedTrxId,
          provider: msg.provider,
          flag: trustFlag,
        },
        merchant.id
      );

      // Escalate any waiting intent/queue item matching this TrxID to MANUAL_REVIEW_REQUIRED
      const waitingQueueRows = await db
        .select()
        .from(verificationQueue)
        .where(
          and(
            eq(verificationQueue.merchantId, merchant.id),
            eq(verificationQueue.submittedTrxId, normalizedTrxId),
            eq(verificationQueue.status, 'WAITING_FOR_SMS')
          )
        )
        .limit(1);

      const waitingQ = waitingQueueRows[0];
      if (waitingQ) {
        const now = new Date();
        await db
          .update(verificationQueue)
          .set({
            status: 'MANUAL_REVIEW_REQUIRED',
            escalationReason: 'TRUST_FLAG_ANOMALY',
            escalatedAt: now,
          })
          .where(eq(verificationQueue.id, waitingQ.id));

        if (waitingQ.paymentIntentId) {
          await db
            .update(paymentIntents)
            .set({
              status: 'MANUAL_REVIEW_REQUIRED',
              escalationReason: 'TRUST_FLAG_ANOMALY',
              smsLedgerId: ledgerId,
              trustFlag,
              stateVersion: sql`${paymentIntents.stateVersion} + 1`,
              updatedAt: now,
            })
            .where(eq(paymentIntents.id, waitingQ.paymentIntentId));
        }

        await db
          .update(checkoutSessions)
          .set({ status: 'ESCALATED' })
          .where(
            and(
              eq(checkoutSessions.merchantId, merchant.id),
              eq(checkoutSessions.externalOrderId, waitingQ.externalOrderId),
              inArray(checkoutSessions.status, ['OPEN', 'SUBMITTED'])
            )
          );
      }

      continue;
    }

    // Look for waiting queue entry (plus GRACE_PERIOD_EXCEEDED if lateSmsAutoApprove is enabled)
    const eligibleStatuses = merchant.lateSmsAutoApprove
      ? (['WAITING_FOR_SMS', 'MANUAL_REVIEW_REQUIRED'] as const)
      : (['WAITING_FOR_SMS'] as const);

    const pendingMatches = await db
      .select()
      .from(verificationQueue)
      .where(
        and(
          eq(verificationQueue.merchantId, merchant.id),
          eq(verificationQueue.submittedTrxId, normalizedTrxId),
          inArray(verificationQueue.status, [...eligibleStatuses])
        )
      )
      .orderBy(desc(verificationQueue.createdAt))
      .limit(1);

    const pendingQueueRecord = pendingMatches[0];
    if (!pendingQueueRecord || !ledgerRow) {
      continue;
    }

    if (
      pendingQueueRecord.status === 'MANUAL_REVIEW_REQUIRED' &&
      pendingQueueRecord.escalationReason !== 'GRACE_PERIOD_EXCEEDED'
    ) {
      continue;
    }

    const intentRows = pendingQueueRecord.paymentIntentId
      ? await db
          .select()
          .from(paymentIntents)
          .where(eq(paymentIntents.id, pendingQueueRecord.paymentIntentId))
          .limit(1)
      : await db
          .select()
          .from(paymentIntents)
          .where(
            and(
              eq(paymentIntents.merchantId, merchant.id),
              eq(paymentIntents.externalRefId, pendingQueueRecord.externalOrderId)
            )
          )
          .limit(1);

    const intent = intentRows[0];
    if (intent && intent.verificationMode === 'PURE_MANUAL') {
      continue;
    }
    if (intent && !['WAITING_FOR_SMS', 'MANUAL_REVIEW_REQUIRED'].includes(intent.status)) {
      continue;
    }

    const effectiveBaseAmount =
      intent?.baseAmount ?? pendingQueueRecord.baseAmount ?? pendingQueueRecord.expectedAmount;
    const effectiveUniqueAmount =
      intent?.uniqueAmount ?? pendingQueueRecord.uniqueAmount ?? pendingQueueRecord.expectedAmount;
    const sessionCreatedAt = intent?.createdAt ?? pendingQueueRecord.createdAt;
    const verifiedTime = new Date();

    const sixFactor = evaluateSixFactors({
      sms: ledgerRow,
      merchant,
      submittedProvider: pendingQueueRecord.provider,
      submittedSender: pendingQueueRecord.submittedSender,
      baseAmount: effectiveBaseAmount,
      uniqueAmount: effectiveUniqueAmount,
      sessionCreatedAt,
      now: verifiedTime,
    });

    if (!sixFactor.ok) {
      await db
        .update(verificationQueue)
        .set({
          status: 'MANUAL_REVIEW_REQUIRED',
          escalationReason: sixFactor.escalationReason,
          escalatedAt: verifiedTime,
        })
        .where(eq(verificationQueue.id, pendingQueueRecord.id));

      if (intent) {
        await db
          .update(paymentIntents)
          .set({
            status: 'MANUAL_REVIEW_REQUIRED',
            escalationReason: sixFactor.escalationReason,
            smsLedgerId: ledgerId,
            trustFlag: ledgerRow.trustFlag,
            stateVersion: intent.stateVersion + 1,
            updatedAt: verifiedTime,
          })
          .where(eq(paymentIntents.id, intent.id));
      }

      await db
        .update(checkoutSessions)
        .set({ status: 'ESCALATED' })
        .where(
          and(
            eq(checkoutSessions.merchantId, merchant.id),
            eq(checkoutSessions.externalOrderId, pendingQueueRecord.externalOrderId),
            inArray(checkoutSessions.status, ['OPEN', 'SUBMITTED'])
          )
        );

      const display = parseDisplayMetadata(
        intent?.displayJson,
        merchant.storeName,
        pendingQueueRecord.externalOrderId
      );
      const actions = parseActionsList(intent?.actionsJson);

      safeWaitUntil(
        ctx,
        Promise.allSettled([
          dispatchWebhook(
            db,
            merchant,
            'payment.escalated_manual',
            {
              paymentIntentId: intent?.id ?? pendingQueueRecord.paymentIntentId,
              merchantId: merchant.id,
              externalRefId: pendingQueueRecord.externalOrderId,
              externalOrderId: pendingQueueRecord.externalOrderId,
              provider: msg.provider,
              trxId: normalizedTrxId,
              baseAmount: effectiveBaseAmount,
              uniqueAmount: effectiveUniqueAmount,
              paidAmount: msg.amount,
              escalationReason: sixFactor.escalationReason,
              reason: sixFactor.reason,
              status: 'MANUAL_REVIEW_REQUIRED',
              callbackUrl: intent?.callbackUrl,
              escalatedAt: verifiedTime.getTime(),
            },
            1,
            undefined,
            intent?.callbackUrl || undefined,
            env
          ),
          sendDynamicPushToMerchantDevices(db, env, merchant, {
            event: 'payment.escalated_manual',
            paymentIntentId: intent?.id,
            externalRefId: pendingQueueRecord.externalOrderId,
            appName: display.appName || merchant.storeName,
            appDomain: display.appDomain,
            category: display.category || intent?.vertical,
            referenceLabel: display.referenceLabel,
            title: `Manual Review (${sixFactor.escalationReason})`,
            subtitle: sixFactor.reason,
            amountFormatted: `৳${msg.amount}`,
            provider: msg.provider,
            paymentStatus: 'MANUAL_REVIEW_REQUIRED',
            adminDeepLink: display.adminDeepLink,
            actions,
          }),
          sendTelegramOfficeAlert(
            merchant,
            `⚠️ Payment Escalated [${display.appName || merchant.storeName}]\nRef: ${pendingQueueRecord.externalOrderId}\nReason: ${sixFactor.escalationReason}\n${sixFactor.reason}`
          ),
        ])
      );

      continue;
    }

    const isLateAuto = pendingQueueRecord.status === 'MANUAL_REVIEW_REQUIRED';
    const resolutionSource = isLateAuto ? 'LATE_SMS_AUTO' : 'AUTO_SMS';

    try {
      const updatedIntent = await executeAtomicVerificationCas(db, {
        merchantId: merchant.id,
        smsId: ledgerId,
        trxId: normalizedTrxId,
        provider: msg.provider,
        matchType: sixFactor.matchType,
        externalRefId: pendingQueueRecord.externalOrderId,
        paymentIntent: intent ?? null,
        resolutionSource,
        submittedSender: pendingQueueRecord.submittedSender,
        paidAmount: msg.amount,
        now: verifiedTime,
      });

      await db
        .update(verificationQueue)
        .set({ status: 'MATCHED', resolvedAt: verifiedTime })
        .where(eq(verificationQueue.id, pendingQueueRecord.id));

      await syncVerifiedOrderAndSession(db, {
        merchantId: merchant.id,
        externalOrderId: pendingQueueRecord.externalOrderId,
        paymentIntentId: intent?.id ?? pendingQueueRecord.paymentIntentId,
        baseAmount: effectiveBaseAmount,
        uniqueAmount: effectiveUniqueAmount,
        paidAmount: msg.amount,
        trxId: normalizedTrxId,
        matchType: sixFactor.matchType,
        customerEmail: pendingQueueRecord.customerEmail,
        customerPhone: pendingQueueRecord.submittedSender,
      });

      await incrementWalletVolume(db, merchant.id, msg.provider, msg.amount);

      const display = parseDisplayMetadata(
        intent?.displayJson,
        merchant.storeName,
        pendingQueueRecord.externalOrderId
      );
      const actions = parseActionsList(intent?.actionsJson);

      const webhookPayload = {
        paymentIntentId: intent?.id ?? pendingQueueRecord.paymentIntentId,
        merchantId: merchant.id,
        externalRefId: pendingQueueRecord.externalOrderId,
        externalOrderId: pendingQueueRecord.externalOrderId,
        vertical: intent?.vertical ?? 'ecommerce',
        provider: msg.provider,
        trxId: normalizedTrxId,
        amount: msg.amount,
        baseAmount: effectiveBaseAmount,
        uniqueAmount: effectiveUniqueAmount,
        paidAmount: msg.amount,
        matchType: sixFactor.matchType,
        senderNumber: normalizedSender,
        resolutionSource,
        stateVersion: updatedIntent?.stateVersion ?? (intent ? intent.stateVersion + 1 : 1),
        status: 'VERIFIED',
        callbackUrl: intent?.callbackUrl,
        verifiedAt: verifiedTime.getTime(),
      };

      safeWaitUntil(
        ctx,
        Promise.allSettled([
          dispatchWebhook(
            db,
            merchant,
            'payment.verified',
            webhookPayload,
            1,
            undefined,
            intent?.callbackUrl || undefined,
            env
          ),
          sendDynamicPushToMerchantDevices(db, env, merchant, {
            event: 'payment.verified',
            paymentIntentId: intent?.id,
            externalRefId: pendingQueueRecord.externalOrderId,
            appName: display.appName || merchant.storeName,
            appDomain: display.appDomain,
            category: display.category || intent?.vertical,
            referenceLabel: display.referenceLabel,
            title: isLateAuto ? 'Late SMS Auto-Verified' : 'Auto-Reconciliation Match',
            subtitle: display.subtitle || `TrxID ${normalizedTrxId}`,
            amountFormatted: `৳${msg.amount}`,
            provider: msg.provider,
            paymentStatus: 'VERIFIED',
            adminDeepLink: display.adminDeepLink,
            actions,
          }),
          sendTelegramOfficeAlert(
            merchant,
            `✅ Reconciled [${display.appName || merchant.storeName}]\nRef: ${pendingQueueRecord.externalOrderId}\nAmount: ৳${msg.amount} (${msg.provider})\nTrxID: ${normalizedTrxId}`
          ),
        ])
      );

      realtimeHub.broadcast(
        'PAYMENT_VERIFIED',
        {
          paymentIntentId: intent?.id ?? pendingQueueRecord.paymentIntentId,
          orderId: pendingQueueRecord.externalOrderId,
          trxId: normalizedTrxId,
          amount: msg.amount,
          baseAmount: effectiveBaseAmount,
          uniqueAmount: effectiveUniqueAmount,
          matchType: sixFactor.matchType,
          provider: msg.provider,
        },
        merchant.id
      );

      autoVerifiedCount++;
    } catch (err) {
      console.warn('[Device Reconciler CAS Skip]:', err);
    }
  }

  return {
    ingestedCount,
    autoVerifiedCount,
    flaggedCount,
  };
}

/**
 * Computes telemetry and transaction analytics for the device & dashboard.
 */
export async function getDeviceStats(
  db: AppDb,
  merchantId: string,
  env?: Env
): Promise<DeviceStatsResult> {
  const merchantRes = await db.select().from(merchants).where(eq(merchants.id, merchantId)).limit(1);
  const merchant = merchantRes[0];

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const recentTransactions = await db
    .select()
    .from(smsLedger)
    .where(eq(smsLedger.merchantId, merchantId))
    .orderBy(desc(smsLedger.smsReceivedAt))
    .limit(50);

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
    .where(
      and(
        eq(verificationQueue.merchantId, merchantId),
        inArray(verificationQueue.status, ['WAITING_FOR_SMS', 'MANUAL_REVIEW_REQUIRED'])
      )
    );

  const onlineStatus = merchant
    ? await computeDeviceOnlineStatus(db, env, merchant)
    : { online: false, lastSeenAt: null, activeSockets: 0 };

  return {
    merchantId,
    storeName: merchant?.storeName || 'ORBIT Store',
    isOnline: onlineStatus.online,
    lastSeenAt: onlineStatus.lastSeenAt,
    activeSockets: onlineStatus.activeSockets,
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

/**
 * Lists merchant orders updated at or after `sinceMs`, capped at 100 items.
 */
export async function listOrdersUpdatedSince(
  db: AppDb,
  merchantId: string,
  sinceMs: number,
  limit = 100
): Promise<MerchantOrderRecord[]> {
  const cappedLimit = Math.min(Math.max(limit, 1), 100);
  const sinceDate = new Date(sinceMs);

  return db
    .select()
    .from(merchantOrders)
    .where(
      and(
        eq(merchantOrders.merchantId, merchantId),
        gte(merchantOrders.updatedAt, sinceDate)
      )
    )
    .orderBy(desc(merchantOrders.updatedAt))
    .limit(cappedLimit);
}

/**
 * Returns incremental sync payload for the mobile companion polling fallback.
 */
export async function getSyncPayload(
  db: AppDb,
  merchantId: string,
  sinceMs?: number
): Promise<DeviceSyncResult> {
  const serverTime = Date.now();
  const effectiveSinceMs = sinceMs ?? serverTime - 24 * 60 * 60 * 1000;
  const sinceDate = new Date(effectiveSinceMs);

  const [verifiedRows, orders, pendingRes] = await Promise.all([
    db
      .select()
      .from(smsLedger)
      .where(
        and(
          eq(smsLedger.merchantId, merchantId),
          inArray(smsLedger.status, ['VERIFIED', 'MANUAL_VERIFIED']),
          isNotNull(smsLedger.verifiedAt),
          gte(smsLedger.verifiedAt, sinceDate)
        )
      )
      .orderBy(desc(smsLedger.verifiedAt))
      .limit(100),
    listOrdersUpdatedSince(db, merchantId, effectiveSinceMs, 100),
    db
      .select({ count: sql<number>`COUNT(*)` })
      .from(merchantOrders)
      .where(
        and(
          eq(merchantOrders.merchantId, merchantId),
          inArray(merchantOrders.orderStatus, ['NEW', 'AWAITING_CONFIRMATION'])
        )
      ),
  ]);

  return {
    serverTime,
    verified: verifiedRows.map((row) => ({
      trxId: row.trxId,
      externalOrderId: row.externalOrderId ?? '',
      verifiedAt: row.verifiedAt ? row.verifiedAt.toISOString() : new Date().toISOString(),
      amount: row.amount,
      provider: row.provider,
    })),
    orders,
    pendingConfirmationCount: Number(pendingRes[0]?.count || 0),
  };
}

export type PreflightOverallStatus = 'READY' | 'ACTION_REQUIRED' | 'ERROR';

export type ProfileMatchStatus =
  | 'MATCHED'
  | 'MISMATCH'
  | 'SIM_NUMBER_UNAVAILABLE'
  | 'PLACEHOLDER_NUMBER';

export interface PreflightWalletItem {
  id: string;
  provider: MfsProvider;
  accountType: AccountType;
  walletNumber: string;
  isPrimary: boolean;
  isActive: boolean;
  isPlaceholder: boolean;
}

export interface PreflightProfileMatch {
  walletId: string;
  provider: MfsProvider;
  walletNumber: string;
  accountType: AccountType;
  isPrimary: boolean;
  isActive: boolean;
  isPlaceholder: boolean;
  status: ProfileMatchStatus;
  matchedSimSlot: number | null;
  matchedCarrier: string | null;
  message: string;
}

export interface DevicePreflightResult {
  overallStatus: PreflightOverallStatus;
  checkedAt: string;
  merchant: {
    id: string;
    storeName: string;
    verificationMode: VerificationMode;
    webhookConfigured: boolean;
    webhookUrl: string;
  };
  walletSummary: {
    totalCount: number;
    activeCount: number;
    placeholderOnly: boolean;
    hasPlaceholderWallets: boolean;
  };
  wallets: PreflightWalletItem[];
  profileMatches: PreflightProfileMatch[];
  deviceStatus: {
    online: boolean;
    lastSeenAt: string | null;
    activeSockets: number;
  };
  recommendations: string[];
}

const PREFLIGHT_PHONE_REGEX = /^01[3-9]\d{8,9}$/;

/**
 * Computes ORBIT Hub readiness and compares active merchant wallets against
 * SIM slot numbers reported or confirmed on the Android companion device.
 */
export async function getDevicePreflight(
  db: AppDb,
  env: Env | undefined,
  merchant: MerchantRecord,
  input?: PreflightCheckDTO
): Promise<DevicePreflightResult> {
  const [rawWallets, onlineStatus] = await Promise.all([
    listWallets(db, merchant.id),
    computeDeviceOnlineStatus(db, env, merchant),
  ]);

  const validDeviceSims = (input?.deviceSimNumbers ?? [])
    .map((slot) => ({
      ...slot,
      normalizedNumber: sanitizePhoneNumber(slot.phoneNumber || ''),
    }))
    .filter((slot) => PREFLIGHT_PHONE_REGEX.test(slot.normalizedNumber));

  const wallets: PreflightWalletItem[] = rawWallets.map((w) => ({
    id: w.id,
    provider: w.provider,
    accountType: w.accountType,
    walletNumber: w.walletNumber,
    isPrimary: w.isPrimary,
    isActive: w.isActive,
    isPlaceholder: isPlaceholderWalletNumber(w.walletNumber),
  }));

  const activeWallets = wallets.filter((w) => w.isActive && !w.isPlaceholder);
  const placeholderOnly = wallets.length > 0 && wallets.every((w) => w.isPlaceholder);
  const hasPlaceholderWallets = wallets.some((w) => w.isPlaceholder);

  const profileMatches: PreflightProfileMatch[] = [];

  for (const w of wallets) {
    if (w.isPlaceholder) {
      profileMatches.push({
        walletId: w.id,
        provider: w.provider,
        walletNumber: w.walletNumber,
        accountType: w.accountType,
        isPrimary: w.isPrimary,
        isActive: w.isActive,
        isPlaceholder: true,
        status: 'PLACEHOLDER_NUMBER',
        matchedSimSlot: null,
        matchedCarrier: null,
        message: 'Replace placeholder number with your real MFS SIM number.',
      });
      continue;
    }

    if (!w.isActive) {
      continue;
    }

    if (validDeviceSims.length === 0) {
      profileMatches.push({
        walletId: w.id,
        provider: w.provider,
        walletNumber: w.walletNumber,
        accountType: w.accountType,
        isPrimary: w.isPrimary,
        isActive: w.isActive,
        isPlaceholder: false,
        status: 'SIM_NUMBER_UNAVAILABLE',
        matchedSimSlot: null,
        matchedCarrier: null,
        message: 'Device SIM number hidden by carrier or not confirmed yet.',
      });
      continue;
    }

    const normalizedWallet = sanitizePhoneNumber(w.walletNumber, w.provider);
    const matchedSim = validDeviceSims.find(
      (sim) => sanitizePhoneNumber(sim.phoneNumber, w.provider) === normalizedWallet
    );

    if (matchedSim) {
      profileMatches.push({
        walletId: w.id,
        provider: w.provider,
        walletNumber: w.walletNumber,
        accountType: w.accountType,
        isPrimary: w.isPrimary,
        isActive: w.isActive,
        isPlaceholder: false,
        status: 'MATCHED',
        matchedSimSlot: matchedSim.slotIndex ?? null,
        matchedCarrier: matchedSim.carrierName ?? null,
        message: 'Matches phone SIM',
      });
    } else {
      profileMatches.push({
        walletId: w.id,
        provider: w.provider,
        walletNumber: w.walletNumber,
        accountType: w.accountType,
        isPrimary: w.isPrimary,
        isActive: w.isActive,
        isPlaceholder: false,
        status: 'MISMATCH',
        matchedSimSlot: null,
        matchedCarrier: null,
        message: 'Configured wallet does not match detected phone SIM numbers.',
      });
    }
  }

  const webhookConfigured = Boolean(
    merchant.webhookUrl && merchant.webhookUrl.trim().startsWith('https://')
  );

  const hasMismatch = profileMatches.some((m) => m.status === 'MISMATCH');
  const hasSimUnavailable = profileMatches.some((m) => m.status === 'SIM_NUMBER_UNAVAILABLE');

  let overallStatus: PreflightOverallStatus = 'READY';
  if (activeWallets.length === 0) {
    overallStatus = 'ERROR';
  } else if (
    hasPlaceholderWallets ||
    hasMismatch ||
    hasSimUnavailable ||
    !webhookConfigured ||
    input?.smsPermission === false
  ) {
    overallStatus = 'ACTION_REQUIRED';
  }

  const recommendations: string[] = [];
  if (activeWallets.length === 0) {
    recommendations.push(
      'No active real MFS wallets configured. Add or activate a bKash, Nagad, Rocket, or Upay SIM wallet in ORBIT Hub or sync from your storefront.'
    );
  }
  if (hasPlaceholderWallets) {
    recommendations.push(
      'Seeded placeholder wallet numbers (01700000000 / 01800000000) detected. Replace them with your real MFS SIM numbers.'
    );
  }
  if (hasSimUnavailable) {
    recommendations.push(
      'Device SIM numbers could not be read automatically. Grant phone permissions or confirm SIM 1 / SIM 2 numbers locally.'
    );
  }
  if (hasMismatch) {
    recommendations.push(
      'One or more active ORBIT wallets do not match the SIM numbers on this phone. Insert the matching SIM or update your storefront/ORBIT wallet numbers.'
    );
  }
  if (!webhookConfigured) {
    recommendations.push(
      'Storefront HTTPS webhook URL is missing or invalid. Configure an https:// webhook URL in ORBIT Storefront & Webhook settings.'
    );
  }
  if (input?.smsPermission === false) {
    recommendations.push(
      'SMS permission is disabled. Grant SMS permission so ORBIT Companion can auto-reconcile incoming payments.'
    );
  }
  if (input?.listenerEnabled === false) {
    recommendations.push(
      'Notification Listener access is disabled. Enable ORBIT Notification Listener for backup MFS notification capture.'
    );
  }
  if (input?.batteryOptimizationIgnored === false) {
    recommendations.push(
      'Battery optimization is active. Exempt ORBIT Companion from battery restrictions to keep background capture running.'
    );
  }

  return {
    overallStatus,
    checkedAt: new Date().toISOString(),
    merchant: {
      id: merchant.id,
      storeName: merchant.storeName,
      verificationMode: merchant.verificationMode,
      webhookConfigured,
      webhookUrl: merchant.webhookUrl,
    },
    walletSummary: {
      totalCount: wallets.length,
      activeCount: activeWallets.length,
      placeholderOnly,
      hasPlaceholderWallets,
    },
    wallets,
    profileMatches,
    deviceStatus: {
      online: onlineStatus.online,
      lastSeenAt: onlineStatus.lastSeenAt ? onlineStatus.lastSeenAt.toISOString() : null,
      activeSockets: onlineStatus.activeSockets,
    },
    recommendations,
  };
}
