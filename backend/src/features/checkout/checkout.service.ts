import { and, desc, eq, gt, inArray, like, or, sql } from 'drizzle-orm';
import type { Context } from 'hono';
import type { AppDb } from '../../db/client';
import {
  checkoutSessions,
  consumedTrxIds,
  mediaAssets,
  merchantOrders,
  merchants,
  paymentIntents,
  smsLedger,
  verificationQueue,
  type EscalationReason,
  type MatchType,
  type MerchantRecord,
  type MfsProvider,
  type PaymentIntentRecord,
} from '../../db/schema';
import { routeImageUpload, signProofAssetToken } from '../../router/image';
import {
  base64UrlDecode,
  createSignedSessionToken,
  generateSecureToken,
  verifySignedSessionToken,
} from '../../shared/crypto';
import {
  AppError,
  BadRequestError,
  ConflictError,
  NotFoundError,
  UnauthorizedError,
} from '../../shared/errors';
import { resolveJwtSecret, safeWaitUntil } from '../../shared/middleware';
import { sanitizePhoneNumber } from '../../shared/parsers/mfs';
import type { AppContextEnv, Env } from '../../shared/types';
import { reserveUniqueCheckoutSession } from '../payments/payments.service';
import {
  computeDeviceOnlineStatus,
  evaluateSixFactors,
  executeAtomicVerificationCas,
  isValidProviderTrxId,
  parseActionsList,
  parseDisplayMetadata,
  syncVerifiedOrderAndSession,
  type DeviceStatusSnapshot,
} from '../payments/verification.engine';
import {
  getActiveRotatedWallet,
  getAllActiveRotatedWallets,
  incrementWalletVolume,
} from '../wallets/wallets.service';
import {
  dispatchWebhook,
  sendDynamicPushToMerchantDevices,
  sendTelegramOfficeAlert,
} from '../webhooks/webhook.dispatcher';
import {
  extractCustomerFromJson,
  extractRealCustomerEmail,
  notifyPaymentSubmittedEmail,
  notifyPaymentVerifiedInvoiceEmail,
} from '../notifications/payment-email.service';
import type { VerifyCheckoutInput } from './checkout.schema';

const OPEN_SESSION_TTL_MS = 15 * 60 * 1000;
const MAX_RECEIPT_UPLOADS_PER_SESSION = 3;
const MAX_SUBMIT_ATTEMPTS = 3;

export interface CheckoutSessionResult {
  sessionId: string;
  paymentIntentId: string;
  sessionToken: string;
  merchantId: string;
  orderId: string;
  storeName: string;
  baseAmount: number;
  uniqueAmount: number;
  expectedAmount: number;
  offsetCents: number;
  expiresAt: Date;
  verificationMode: 'AUTO' | 'PURE_MANUAL';
  receiptPolicy: string;
  customerEmail?: string | null;
  deviceStatus: DeviceStatusSnapshot;
  activeWallets: {
    provider: MfsProvider;
    walletNumber: string;
    accountType: string;
    isPrimary: boolean;
  }[];
}

export interface VerifyResult {
  status: 'VERIFIED' | 'PENDING_VERIFICATION' | 'MANUAL_REVIEW_REQUIRED';
  paymentIntentId?: string;
  trxId?: string;
  amount?: number;
  baseAmount?: number;
  uniqueAmount?: number;
  paidAmount?: number;
  matchType?: MatchType;
  provider?: string;
  customerEmail?: string | null;
  escalationReason?: EscalationReason | null;
  deviceOnline?: boolean;
  receiptPolicy?: string;
  message?: string;
  expiresAt?: Date;
  stateVersion?: number;
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

export { syncVerifiedOrderAndSession };

/**
 * Creates (or idempotently reuses) a checkout session + linked payment_intent
 * with a unique poisha amount in [1..99] and 15m TTL for OPEN sessions.
 */
export async function createCheckoutSession(
  db: AppDb,
  merchantId: string,
  orderId: string,
  amount: number,
  customerEmail?: string,
  requestedProvider?: MfsProvider,
  env?: Env
): Promise<CheckoutSessionResult> {
  if (amount <= 0) {
    throw new BadRequestError('Payment amount must be greater than zero');
  }

  const baseAmount = Math.round(amount * 100) / 100;
  const effectiveEmail = customerEmail?.trim() || 'buyer@orbitsaas.cloud';

  const merchantRes = await db
    .select()
    .from(merchants)
    .where(and(eq(merchants.id, merchantId), eq(merchants.isActive, true)))
    .limit(1);

  const merchant = merchantRes[0];
  if (!merchant) {
    throw new NotFoundError(`Active merchant '${merchantId}' not found`);
  }

  let wallets = await getAllActiveRotatedWallets(db, merchantId, env);
  if (requestedProvider) {
    const specific = await getActiveRotatedWallet(db, merchantId, requestedProvider, env);
    if (specific) {
      wallets = [specific];
    }
  }

  if (wallets.length === 0) {
    throw new BadRequestError('No active SIM wallets configured for this merchant');
  }

  const now = new Date();
  const deviceStatus = await computeDeviceOnlineStatus(db, env, merchant);

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
  let paymentIntentId: string;
  let uniqueAmount: number;
  let offsetCents: number;
  let expiresAt: Date;

  if (reusable && Math.abs(reusable.baseAmount - baseAmount) < 0.001) {
    sessionId = reusable.id;
    uniqueAmount = reusable.uniqueAmount;
    offsetCents = reusable.offsetCents;
    expiresAt = reusable.expiresAt;
    paymentIntentId = reusable.paymentIntentId || `pay_${generateSecureToken(16)}`;

    if (!reusable.paymentIntentId) {
      const existingIntent = await db
        .select()
        .from(paymentIntents)
        .where(and(eq(paymentIntents.merchantId, merchantId), eq(paymentIntents.externalRefId, orderId)))
        .limit(1);

      if (existingIntent[0]) {
        paymentIntentId = existingIntent[0].id;
      } else {
        await db.insert(paymentIntents).values({
          id: paymentIntentId,
          merchantId,
          vertical: 'ecommerce',
          externalRefId: orderId,
          verificationMode: merchant.verificationMode,
          status: 'OPEN',
          baseAmount,
          uniqueAmount,
          provider: requestedProvider ?? null,
          customerJson: JSON.stringify({ email: effectiveEmail }),
          stateVersion: 1,
          submitAttempts: 0,
          expiresAt,
          createdAt: now,
          updatedAt: now,
        });
      }

      await db
        .update(checkoutSessions)
        .set({ paymentIntentId })
        .where(eq(checkoutSessions.id, sessionId));
    }
  } else {
    expiresAt = new Date(now.getTime() + OPEN_SESSION_TTL_MS);

    const existingIntent = await db
      .select()
      .from(paymentIntents)
      .where(and(eq(paymentIntents.merchantId, merchantId), eq(paymentIntents.externalRefId, orderId)))
      .limit(1);

    paymentIntentId = existingIntent[0]?.id || `pay_${generateSecureToken(16)}`;

    const reserved = await reserveUniqueCheckoutSession(db, {
      merchantId,
      paymentIntentId,
      vertical: 'ecommerce',
      externalOrderId: orderId,
      customerEmail: effectiveEmail,
      baseAmount,
      provider: requestedProvider ?? null,
      expiresAt,
    });

    sessionId = reserved.sessionId;
    uniqueAmount = reserved.uniqueAmount;
    offsetCents = reserved.offsetCents;

    if (!existingIntent[0]) {
      await db.insert(paymentIntents).values({
        id: paymentIntentId,
        merchantId,
        vertical: 'ecommerce',
        externalRefId: orderId,
        verificationMode: merchant.verificationMode,
        status: 'OPEN',
        baseAmount,
        uniqueAmount,
        provider: requestedProvider ?? null,
        customerJson: JSON.stringify({ email: effectiveEmail }),
        stateVersion: 1,
        submitAttempts: 0,
        expiresAt,
        createdAt: now,
        updatedAt: now,
      });
    }
  }

  const sessionToken = await createSignedSessionToken(
    {
      sessionId,
      paymentIntentId,
      merchantId,
      orderId,
      externalRefId: orderId,
      baseAmount,
      uniqueAmount,
      offsetCents,
      amount: uniqueAmount,
      customerEmail: effectiveEmail,
      exp: expiresAt.getTime(),
    },
    merchant.webhookSecret
  );

  return {
    sessionId,
    paymentIntentId,
    sessionToken,
    merchantId,
    orderId,
    storeName: merchant.storeName,
    baseAmount,
    uniqueAmount,
    expectedAmount: uniqueAmount,
    offsetCents,
    expiresAt,
    verificationMode: merchant.verificationMode,
    receiptPolicy: merchant.receiptPolicy,
    customerEmail: extractRealCustomerEmail(customerEmail, reusable?.customerEmail, effectiveEmail),
    deviceStatus,
    activeWallets: wallets.map((w) => ({
      provider: w.provider,
      walletNumber: w.walletNumber,
      accountType: w.accountType,
      isPrimary: w.isPrimary,
      label: w.label,
      safeVolumeLimit: w.safeVolumeLimit,
      monthlyVolumeLimit: w.monthlyVolumeLimit,
      currentMonthVolume: w.currentMonthVolume,
      rotationState: w.rotationState,
      deviceOnline: w.deviceOnline,
    })),
  };
}

/**
 * Public immutable session hydration endpoint handler for Hosted Checkout & Embedded Widget.
 */
export async function getPublicCheckoutSession(
  db: AppDb,
  env: Env,
  sessionId: string
) {
  const sessionRows = await db
    .select()
    .from(checkoutSessions)
    .where(eq(checkoutSessions.id, sessionId))
    .limit(1);

  const session = sessionRows[0];
  if (!session) {
    throw new NotFoundError(`Checkout session '${sessionId}' not found`);
  }

  const merchantRes = await db
    .select()
    .from(merchants)
    .where(and(eq(merchants.id, session.merchantId), eq(merchants.isActive, true)))
    .limit(1);

  const merchant = merchantRes[0];
  if (!merchant) {
    throw new NotFoundError('Merchant is inactive or not found');
  }

  const [wallets, deviceStatus, intentRows] = await Promise.all([
    getAllActiveRotatedWallets(db, merchant.id, env),
    computeDeviceOnlineStatus(db, env, merchant),
    session.paymentIntentId
      ? db.select().from(paymentIntents).where(eq(paymentIntents.id, session.paymentIntentId)).limit(1)
      : db
          .select()
          .from(paymentIntents)
          .where(
            and(
              eq(paymentIntents.merchantId, merchant.id),
              eq(paymentIntents.externalRefId, session.externalOrderId)
            )
          )
          .limit(1),
  ]);

  const intent = intentRows[0];
  const intentCustomer = extractCustomerFromJson(intent?.customerJson);
  const customerEmail = extractRealCustomerEmail(intentCustomer.email, session.customerEmail);

  return {
    sessionId: session.id,
    paymentIntentId: intent?.id ?? session.paymentIntentId ?? null,
    merchantId: merchant.id,
    storeName: merchant.storeName,
    externalOrderId: session.externalOrderId,
    externalRefId: session.externalOrderId,
    vertical: intent?.vertical ?? session.vertical,
    status: intent?.status ?? session.status,
    sessionStatus: session.status,
    baseAmount: session.baseAmount,
    uniqueAmount: session.uniqueAmount,
    offsetCents: session.offsetCents,
    provider: intent?.provider ?? session.provider,
    verificationMode: intent?.verificationMode ?? merchant.verificationMode,
    receiptPolicy: merchant.receiptPolicy,
    customerEmail,
    deviceStatus,
    activeWallets: wallets.map((w) => ({
      provider: w.provider,
      walletNumber: w.walletNumber,
      accountType: w.accountType,
      isPrimary: w.isPrimary,
      label: w.label,
      safeVolumeLimit: w.safeVolumeLimit,
      monthlyVolumeLimit: w.monthlyVolumeLimit,
      currentMonthVolume: w.currentMonthVolume,
      rotationState: w.rotationState,
      deviceOnline: w.deviceOnline,
    })),
    display: parseDisplayMetadata(
      intent?.displayJson ?? session.displayJson,
      merchant.storeName,
      session.externalOrderId
    ),
    actions: parseActionsList(intent?.actionsJson ?? session.actionsJson),
    trxId: intent?.trxId ?? null,
    paidAmount: intent?.paidAmount ?? null,
    matchType: intent?.matchType ?? null,
    receiptUrl: intent?.receiptUrl ?? null,
    escalationReason: intent?.escalationReason ?? null,
    returnUrl: intent?.returnUrl ?? null,
    cancelUrl: intent?.cancelUrl ?? null,
    graceExpiresAt: intent?.graceExpiresAt ?? null,
    expiresAt: session.expiresAt,
    createdAt: session.createdAt,
  };
}

/**
 * Handles payment receipt screenshot upload gated by signed sessionToken,
 * strict PNG/JPEG/WEBP magic-byte verification, max 3 uploads, and private R2/D1 storage.
 */
export async function uploadCheckoutReceipt(
  db: AppDb,
  env: Env,
  params: {
    sessionToken: string;
    fileName: string;
    mimeType: string;
    bytes: Uint8Array;
    origin?: string;
  }
) {
  if (!params.sessionToken) {
    throw new UnauthorizedError('Signed sessionToken is required for receipt upload');
  }

  // Decode unverified payload ONLY to look up the merchant and verify HMAC signature immediately
  let unverifiedSessionId: string | undefined;
  let unverifiedMerchantId: string | undefined;
  try {
    const [encodedPayload] = params.sessionToken.split('.');
    if (encodedPayload) {
      const parsed = JSON.parse(base64UrlDecode(encodedPayload)) as {
        sessionId?: string;
        merchantId?: string;
      };
      unverifiedSessionId = parsed.sessionId;
      unverifiedMerchantId = parsed.merchantId;
    }
  } catch {
    throw new UnauthorizedError('Malformed sessionToken');
  }

  if (!unverifiedSessionId || !unverifiedMerchantId) {
    throw new UnauthorizedError('Invalid sessionToken claims');
  }

  const [merchantRes, sessionRes] = await Promise.all([
    db
      .select()
      .from(merchants)
      .where(and(eq(merchants.id, unverifiedMerchantId), eq(merchants.isActive, true)))
      .limit(1),
    db
      .select()
      .from(checkoutSessions)
      .where(
        and(
          eq(checkoutSessions.id, unverifiedSessionId),
          eq(checkoutSessions.merchantId, unverifiedMerchantId)
        )
      )
      .limit(1),
  ]);

  const merchant = merchantRes[0];
  const session = sessionRes[0];
  if (!merchant || !session) {
    throw new NotFoundError('Checkout session or merchant not found');
  }

  const verifiedClaims = await verifySignedSessionToken<{
    sessionId: string;
    merchantId: string;
    paymentIntentId?: string;
    exp?: number;
  }>(params.sessionToken, merchant.webhookSecret);

  if (
    !verifiedClaims ||
    verifiedClaims.sessionId !== session.id ||
    verifiedClaims.merchantId !== merchant.id ||
    (typeof verifiedClaims.exp === 'number' && Date.now() > verifiedClaims.exp)
  ) {
    throw new UnauthorizedError('Invalid or expired sessionToken');
  }

  if (merchant.receiptPolicy === 'DISABLED') {
    throw new BadRequestError('Receipt uploads are disabled for this merchant');
  }

  if (!['OPEN', 'SUBMITTED'].includes(session.status)) {
    throw new BadRequestError(`Cannot upload receipt for session in status '${session.status}'`);
  }

  // Enforce max 3 receipt uploads per session
  const countRows = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(mediaAssets)
    .where(like(mediaAssets.storageKey, `proofs/${session.id}/%`));

  const uploadCount = Number(countRows[0]?.count || 0);
  if (uploadCount >= MAX_RECEIPT_UPLOADS_PER_SESSION) {
    throw new AppError(
      `Maximum receipt upload limit (${MAX_RECEIPT_UPLOADS_PER_SESSION}) reached for this session`,
      429,
      'MAX_RECEIPT_UPLOADS_EXCEEDED'
    );
  }

  const uploadResult = await routeImageUpload(
    env,
    db,
    {
      fileName: params.fileName,
      mimeType: params.mimeType,
      bytes: params.bytes,
      merchantId: merchant.id,
      strictPaymentProof: true,
      storageKeyPrefix: `proofs/${session.id}`,
    },
    merchant.id
  );

  if (!uploadResult.success || !uploadResult.data) {
    throw new AppError(
      uploadResult.error || 'Failed to store payment receipt proof',
      502,
      'RECEIPT_UPLOAD_FAILED'
    );
  }

  const assetId = uploadResult.data.assetId;
  const proofToken = await signProofAssetToken(assetId, resolveJwtSecret(env));
  const relativeUrl = `/api/v1/router/image/${assetId}?token=${encodeURIComponent(proofToken)}`;
  const receiptUrl = params.origin ? `${params.origin}${relativeUrl}` : relativeUrl;

  if (session.paymentIntentId) {
    await db
      .update(paymentIntents)
      .set({
        receiptAssetId: assetId,
        receiptUrl,
        updatedAt: new Date(),
      })
      .where(eq(paymentIntents.id, session.paymentIntentId));
  }

  return {
    assetId,
    receiptUrl,
    uploadsUsed: uploadCount + 1,
    uploadsRemaining: MAX_RECEIPT_UPLOADS_PER_SESSION - (uploadCount + 1),
  };
}

/**
 * Helper to escalate a payment submission into MANUAL_REVIEW_REQUIRED across all ledger tables
 * and dispatch signed `payment.submitted` + `payment.escalated_manual` webhooks & pushes.
 */
async function escalatePaymentToManualReview(
  db: AppDb,
  env: Env | undefined,
  merchant: MerchantRecord,
  params: {
    intent: PaymentIntentRecord;
    activeSession?: typeof checkoutSessions.$inferSelect;
    provider: MfsProvider;
    submittedTrxId: string;
    submittedSender: string;
    submittedAmount: number;
    effectiveBaseAmount: number;
    effectiveUniqueAmount: number;
    customerEmail: string;
    customerName?: string;
    receiptAssetId?: string | null;
    receiptUrl?: string | null;
    deviceOnline: boolean;
    escalationReason: EscalationReason;
    smsLedgerId?: string | null;
    trustFlag?: string | null;
    message: string;
    ctx?: Context<AppContextEnv>;
  }
): Promise<VerifyResult> {
  const now = new Date();
  const graceMinutes = merchant.gracePeriodMinutes || 60;
  const expiresAt = new Date(now.getTime() + graceMinutes * 60 * 1000);

  const updatedIntents = await db
    .update(paymentIntents)
    .set({
      status: 'MANUAL_REVIEW_REQUIRED',
      provider: params.provider,
      trxId: params.submittedTrxId,
      senderNumber: params.submittedSender,
      paidAmount: params.submittedAmount,
      receiptAssetId: params.receiptAssetId ?? params.intent.receiptAssetId,
      receiptUrl: params.receiptUrl ?? params.intent.receiptUrl,
      deviceOnlineAtSubmit: params.deviceOnline,
      smsLedgerId: params.smsLedgerId ?? params.intent.smsLedgerId,
      trustFlag: params.trustFlag ?? params.intent.trustFlag,
      escalationReason: params.escalationReason,
      stateVersion: params.intent.stateVersion + 1,
      updatedAt: now,
    })
    .where(eq(paymentIntents.id, params.intent.id))
    .returning();

  const updatedIntent = updatedIntents[0] || params.intent;

  const existingQueue = await db
    .select()
    .from(verificationQueue)
    .where(
      and(
        eq(verificationQueue.merchantId, merchant.id),
        or(
          eq(verificationQueue.paymentIntentId, params.intent.id),
          eq(verificationQueue.externalOrderId, params.intent.externalRefId)
        )
      )
    )
    .limit(1);

  const realCustomerEmail = extractRealCustomerEmail(params.customerEmail);

  if (existingQueue[0]) {
    await db
      .update(verificationQueue)
      .set({
        provider: params.provider,
        ...(realCustomerEmail ? { customerEmail: realCustomerEmail } : {}),
        submittedAmount: params.submittedAmount,
        submittedTrxId: params.submittedTrxId,
        submittedSender: params.submittedSender,
        receiptAssetId: params.receiptAssetId ?? existingQueue[0].receiptAssetId,
        receiptUrl: params.receiptUrl ?? existingQueue[0].receiptUrl,
        escalationReason: params.escalationReason,
        escalatedAt: now,
        status: 'MANUAL_REVIEW_REQUIRED',
      })
      .where(eq(verificationQueue.id, existingQueue[0].id));
  } else {
    await db.insert(verificationQueue).values({
      id: `que_${generateSecureToken(16)}`,
      merchantId: merchant.id,
      paymentIntentId: params.intent.id,
      provider: params.provider,
      externalOrderId: params.intent.externalRefId,
      customerEmail: params.customerEmail,
      expectedAmount: params.effectiveBaseAmount,
      baseAmount: params.effectiveBaseAmount,
      uniqueAmount: params.effectiveUniqueAmount,
      submittedAmount: params.submittedAmount,
      submittedTrxId: params.submittedTrxId,
      submittedSender: params.submittedSender,
      receiptAssetId: params.receiptAssetId ?? null,
      receiptUrl: params.receiptUrl ?? null,
      escalationReason: params.escalationReason,
      escalatedAt: now,
      status: 'MANUAL_REVIEW_REQUIRED',
      expiresAt,
      createdAt: now,
    });
  }

  if (params.activeSession) {
    await db
      .update(checkoutSessions)
      .set({ status: 'ESCALATED', provider: params.provider })
      .where(eq(checkoutSessions.id, params.activeSession.id));
  }

  await db
    .update(merchantOrders)
    .set({
      paymentIntentId: params.intent.id,
      paymentStatus: 'PENDING_VERIFICATION',
      trxId: params.submittedTrxId,
      uniqueAmount: params.effectiveUniqueAmount,
      paidAmount: params.submittedAmount,
      updatedAt: now,
    })
    .where(
      and(
        eq(merchantOrders.merchantId, merchant.id),
        eq(merchantOrders.externalOrderId, params.intent.externalRefId)
      )
    );

  const display = parseDisplayMetadata(
    updatedIntent.displayJson,
    merchant.storeName,
    updatedIntent.externalRefId
  );
  const actions = parseActionsList(updatedIntent.actionsJson);

  const webhookPayload = {
    paymentIntentId: updatedIntent.id,
    merchantId: merchant.id,
    externalRefId: updatedIntent.externalRefId,
    externalOrderId: updatedIntent.externalRefId,
    vertical: updatedIntent.vertical,
    provider: params.provider,
    trxId: params.submittedTrxId,
    senderNumber: params.submittedSender,
    baseAmount: params.effectiveBaseAmount,
    uniqueAmount: params.effectiveUniqueAmount,
    paidAmount: params.submittedAmount,
    receiptUrl: updatedIntent.receiptUrl,
    deviceOnline: params.deviceOnline,
    escalationReason: params.escalationReason,
    stateVersion: updatedIntent.stateVersion,
    status: 'MANUAL_REVIEW_REQUIRED',
    callbackUrl: updatedIntent.callbackUrl,
    escalatedAt: now.getTime(),
  };

  safeWaitUntil(
    params.ctx,
    Promise.allSettled([
      dispatchWebhook(
        db,
        merchant,
        'payment.submitted',
        webhookPayload,
        1,
        undefined,
        updatedIntent.callbackUrl || undefined,
        env
      ),
      dispatchWebhook(
        db,
        merchant,
        'payment.escalated_manual',
        webhookPayload,
        1,
        undefined,
        updatedIntent.callbackUrl || undefined,
        env
      ),
      sendDynamicPushToMerchantDevices(db, env, merchant, {
        event: 'payment.escalated_manual',
        paymentIntentId: updatedIntent.id,
        externalRefId: updatedIntent.externalRefId,
        appName: display.appName || merchant.storeName,
        appDomain: display.appDomain,
        category: display.category || updatedIntent.vertical,
        referenceLabel: display.referenceLabel,
        title: `Manual Review Needed (${params.escalationReason})`,
        subtitle: display.subtitle || `TrxID ${params.submittedTrxId}`,
        amountFormatted: `৳${params.submittedAmount}`,
        provider: params.provider,
        paymentStatus: 'MANUAL_REVIEW_REQUIRED',
        adminDeepLink: display.adminDeepLink,
        actions,
      }),
      sendTelegramOfficeAlert(
        merchant,
        `⚠️ Manual Review Required [${display.appName || merchant.storeName}]\nRef: ${updatedIntent.externalRefId}\nReason: ${params.escalationReason}\nAmount: ৳${params.submittedAmount} (${params.provider})\nTrxID: ${params.submittedTrxId}`
      ),
      notifyPaymentSubmittedEmail(db, env, {
        merchantId: merchant.id,
        storeName: display.appName || merchant.storeName,
        externalRefId: updatedIntent.externalRefId,
        customerEmail: realCustomerEmail,
        customerName: params.customerName,
        amount: params.submittedAmount,
        provider: params.provider,
        trxId: params.submittedTrxId,
        senderNumber: params.submittedSender,
        status: 'MANUAL_REVIEW_REQUIRED',
        submittedAt: now,
      }),
    ])
  );

  return {
    status: 'MANUAL_REVIEW_REQUIRED',
    paymentIntentId: updatedIntent.id,
    trxId: params.submittedTrxId,
    amount: params.submittedAmount,
    baseAmount: params.effectiveBaseAmount,
    uniqueAmount: params.effectiveUniqueAmount,
    paidAmount: params.submittedAmount,
    provider: params.provider,
    customerEmail: realCustomerEmail,
    escalationReason: params.escalationReason,
    deviceOnline: params.deviceOnline,
    receiptPolicy: merchant.receiptPolicy,
    stateVersion: updatedIntent.stateVersion,
    message: params.message,
    expiresAt,
  };
}

/**
 * Verifies submitted checkout payment using the Zero-False-Positive 6-Factor Engine
 * and Zero-Lost-Buyer fallback cascade (AUTO / Offline Queue / PURE_MANUAL).
 */
export async function verifyCheckoutPayment(
  db: AppDb,
  merchant: MerchantRecord,
  payload: VerifyCheckoutInput,
  fcmServerKeyOrEnv?: string | Env,
  ctx?: Context<AppContextEnv>
): Promise<VerifyResult> {
  const env = typeof fcmServerKeyOrEnv === 'string' ? undefined : fcmServerKeyOrEnv;
  const submittedTrxId = payload.trxId.trim().toUpperCase();
  const submittedSender = sanitizePhoneNumber(payload.senderNumber, payload.provider);
  const now = new Date();

  if (!/^01[3-9]\d{8}$/.test(submittedSender)) {
    throw new BadRequestError('Please enter a valid 11-digit mobile number (e.g. 017XXXXXXXX)');
  }

  if (!isValidProviderTrxId(payload.provider, submittedTrxId)) {
    throw new BadRequestError(
      `Invalid ${payload.provider} Transaction ID format '${submittedTrxId}'`
    );
  }

  // Resolve active checkout_session
  const sessionRes = payload.sessionId
    ? await db
        .select()
        .from(checkoutSessions)
        .where(
          and(
            eq(checkoutSessions.id, payload.sessionId),
            eq(checkoutSessions.merchantId, merchant.id)
          )
        )
        .limit(1)
    : await db
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

  // Enforce signed sessionToken whenever a checkout_session exists
  if (activeSession) {
    if (!payload.sessionToken) {
      throw new UnauthorizedError('Signed sessionToken is required for this checkout session');
    }
    const claims = await verifySignedSessionToken<{
      sessionId?: string;
      merchantId?: string;
      exp?: number;
    }>(payload.sessionToken, merchant.webhookSecret);

    if (
      !claims ||
      claims.sessionId !== activeSession.id ||
      claims.merchantId !== merchant.id ||
      (typeof claims.exp === 'number' && Date.now() > claims.exp)
    ) {
      throw new UnauthorizedError('Invalid or expired sessionToken');
    }
  }

  // Resolve or lazily materialize payment_intents record
  const intentRes =
    payload.paymentIntentId || activeSession?.paymentIntentId
      ? await db
          .select()
          .from(paymentIntents)
          .where(
            and(
              eq(paymentIntents.merchantId, merchant.id),
              eq(paymentIntents.id, (payload.paymentIntentId || activeSession?.paymentIntentId)!)
            )
          )
          .limit(1)
      : await db
          .select()
          .from(paymentIntents)
          .where(
            and(
              eq(paymentIntents.merchantId, merchant.id),
              eq(paymentIntents.externalRefId, payload.orderId)
            )
          )
          .limit(1);

  let intent: PaymentIntentRecord | undefined = intentRes[0];

  const effectiveBaseAmount =
    intent?.baseAmount ?? activeSession?.baseAmount ?? payload.baseAmount ?? payload.paidAmount ?? payload.amount ?? 0;
  const effectiveUniqueAmount =
    intent?.uniqueAmount ?? activeSession?.uniqueAmount ?? effectiveBaseAmount;
  const submittedAmount = payload.paidAmount ?? payload.amount ?? effectiveBaseAmount;
  if (submittedAmount <= 0 || effectiveBaseAmount <= 0) {
    throw new BadRequestError('Could not determine payment amount for this order');
  }
  const intentCustomer = extractCustomerFromJson(intent?.customerJson);
  const payloadRealEmail = extractRealCustomerEmail(payload.customerEmail);
  const realCustomerEmail = extractRealCustomerEmail(
    payload.customerEmail,
    intentCustomer.email,
    activeSession?.customerEmail
  );
  const effectiveCustomerEmail =
    realCustomerEmail || activeSession?.customerEmail || 'buyer@orbitsaas.cloud';

  if (intent) {
    if (intent.status === 'VERIFIED') {
      return {
        status: 'VERIFIED',
        paymentIntentId: intent.id,
        trxId: intent.trxId || submittedTrxId,
        amount: intent.paidAmount ?? intent.uniqueAmount,
        baseAmount: intent.baseAmount,
        uniqueAmount: intent.uniqueAmount,
        paidAmount: intent.paidAmount ?? intent.uniqueAmount,
        matchType: intent.matchType ?? 'EXACT_UNIQUE',
        provider: intent.provider ?? payload.provider,
        customerEmail: realCustomerEmail,
        stateVersion: intent.stateVersion,
      };
    }

    if (intent.submitAttempts >= MAX_SUBMIT_ATTEMPTS) {
      throw new AppError(
        `Maximum payment submission attempts (${MAX_SUBMIT_ATTEMPTS}) exceeded`,
        429,
        'MAX_SUBMIT_ATTEMPTS_EXCEEDED'
      );
    }

    const updatedCustomerJson = payloadRealEmail
      ? JSON.stringify({
          ...intentCustomer,
          email: payloadRealEmail,
          ...(intentCustomer.phone ? {} : { phone: submittedSender }),
        })
      : undefined;

    const bumped = await db
      .update(paymentIntents)
      .set({
        submitAttempts: intent.submitAttempts + 1,
        ...(updatedCustomerJson ? { customerJson: updatedCustomerJson } : {}),
        updatedAt: now,
      })
      .where(eq(paymentIntents.id, intent.id))
      .returning();
    intent = bumped[0] || intent;
  } else {
    const intentId = `pay_${generateSecureToken(16)}`;
    const fallbackExpires = activeSession?.expiresAt ?? new Date(now.getTime() + OPEN_SESSION_TTL_MS);
    await db.insert(paymentIntents).values({
      id: intentId,
      merchantId: merchant.id,
      vertical: 'ecommerce',
      externalRefId: payload.orderId,
      verificationMode: merchant.verificationMode,
      status: 'OPEN',
      baseAmount: effectiveBaseAmount,
      uniqueAmount: effectiveUniqueAmount,
      customerJson: JSON.stringify({ email: effectiveCustomerEmail, phone: submittedSender }),
      stateVersion: 1,
      submitAttempts: 1,
      expiresAt: fallbackExpires,
      createdAt: activeSession?.createdAt ?? now,
      updatedAt: now,
    });
    const inserted = await db
      .select()
      .from(paymentIntents)
      .where(eq(paymentIntents.id, intentId))
      .limit(1);
    intent = inserted[0];

    if (activeSession) {
      await db
        .update(checkoutSessions)
        .set({ paymentIntentId: intentId })
        .where(eq(checkoutSessions.id, activeSession.id));
    }
  }

  if (payloadRealEmail) {
    await Promise.all([
      activeSession
        ? db
            .update(checkoutSessions)
            .set({ customerEmail: payloadRealEmail })
            .where(eq(checkoutSessions.id, activeSession.id))
        : Promise.resolve(),
      db
        .update(merchantOrders)
        .set({ customerEmail: payloadRealEmail, updatedAt: now })
        .where(
          and(
            eq(merchantOrders.merchantId, merchant.id),
            eq(merchantOrders.externalOrderId, payload.orderId)
          )
        ),
    ]);
  }

  // Global cross-mode TrxID single-use check
  const consumedRows = await db
    .select()
    .from(consumedTrxIds)
    .where(
      and(
        eq(consumedTrxIds.merchantId, merchant.id),
        eq(consumedTrxIds.trxId, submittedTrxId)
      )
    )
    .limit(1);

  if (consumedRows[0] && consumedRows[0].paymentIntentId !== intent.id) {
    throw new ConflictError(`Transaction ID '${submittedTrxId}' has already been consumed`);
  }

  // Enforce ALWAYS_REQUIRED receipt policy
  const effectiveReceiptAssetId = payload.receiptAssetId ?? intent.receiptAssetId ?? null;
  const effectiveReceiptUrl = payload.receiptUrl ?? intent.receiptUrl ?? null;
  if (merchant.receiptPolicy === 'ALWAYS_REQUIRED' && !effectiveReceiptAssetId && !effectiveReceiptUrl) {
    throw new BadRequestError('Payment receipt screenshot upload is required before verification');
  }

  const deviceStatus = await computeDeviceOnlineStatus(db, env, merchant);
  const verificationMode = intent.verificationMode ?? merchant.verificationMode;

  // PURE_MANUAL Mode: route directly to MANUAL_REVIEW_REQUIRED
  if (verificationMode === 'PURE_MANUAL') {
    return escalatePaymentToManualReview(db, env, merchant, {
      intent,
      activeSession,
      provider: payload.provider,
      submittedTrxId,
      submittedSender,
      submittedAmount,
      effectiveBaseAmount,
      effectiveUniqueAmount,
      customerEmail: effectiveCustomerEmail,
      customerName: intentCustomer.name,
      receiptAssetId: effectiveReceiptAssetId,
      receiptUrl: effectiveReceiptUrl,
      deviceOnline: deviceStatus.online,
      escalationReason: 'PURE_MANUAL_MODE',
      message: 'Payment proof submitted for manual store verification.',
      ctx,
    });
  }

  // AUTO Mode: Look up sms_ledger by (merchantId, trxId)
  const existingLedgerRecords = await db
    .select()
    .from(smsLedger)
    .where(and(eq(smsLedger.merchantId, merchant.id), eq(smsLedger.trxId, submittedTrxId)))
    .limit(1);

  const matchedSms = existingLedgerRecords[0];

  if (matchedSms) {
    if (matchedSms.status !== 'UNCLAIMED') {
      throw new ConflictError(`Transaction ID '${submittedTrxId}' has already been claimed`);
    }

    const sessionCreatedAt = activeSession?.createdAt ?? intent.createdAt;
    const sixFactor = evaluateSixFactors({
      sms: matchedSms,
      merchant,
      submittedProvider: payload.provider,
      submittedSender,
      baseAmount: effectiveBaseAmount,
      uniqueAmount: effectiveUniqueAmount,
      sessionCreatedAt,
      now,
    });

    if (!sixFactor.ok) {
      return escalatePaymentToManualReview(db, env, merchant, {
        intent,
        activeSession,
        provider: payload.provider,
        submittedTrxId,
        submittedSender,
        submittedAmount,
        effectiveBaseAmount,
        effectiveUniqueAmount,
        customerEmail: effectiveCustomerEmail,
        customerName: intentCustomer.name,
        receiptAssetId: effectiveReceiptAssetId,
        receiptUrl: effectiveReceiptUrl,
        deviceOnline: deviceStatus.online,
        escalationReason: sixFactor.escalationReason,
        smsLedgerId: matchedSms.id,
        trustFlag: matchedSms.trustFlag,
        message: sixFactor.reason,
        ctx,
      });
    }

    // Factor 6: Atomic CAS + consumed_trx_ids
    const updatedIntent = await executeAtomicVerificationCas(db, {
      merchantId: merchant.id,
      smsId: matchedSms.id,
      trxId: submittedTrxId,
      provider: matchedSms.provider,
      matchType: sixFactor.matchType,
      externalRefId: payload.orderId,
      paymentIntent: intent,
      resolutionSource: 'AUTO_SMS',
      submittedSender,
      paidAmount: matchedSms.amount,
      receiptAssetId: effectiveReceiptAssetId,
      receiptUrl: effectiveReceiptUrl,
      deviceOnlineAtSubmit: deviceStatus.online,
      now,
    });

    await incrementWalletVolume(
      db,
      merchant.id,
      matchedSms.provider,
      matchedSms.amount,
      matchedSms.receiverNumber ?? undefined,
      { merchant, env }
    );

    await db
      .update(verificationQueue)
      .set({ status: 'MATCHED', resolvedAt: now })
      .where(
        and(
          eq(verificationQueue.merchantId, merchant.id),
          or(
            eq(verificationQueue.paymentIntentId, intent.id),
            eq(verificationQueue.submittedTrxId, submittedTrxId)
          ),
          eq(verificationQueue.status, 'WAITING_FOR_SMS')
        )
      );

    await syncVerifiedOrderAndSession(db, {
      merchantId: merchant.id,
      externalOrderId: payload.orderId,
      paymentIntentId: intent.id,
      baseAmount: effectiveBaseAmount,
      uniqueAmount: effectiveUniqueAmount,
      paidAmount: matchedSms.amount,
      trxId: submittedTrxId,
      matchType: sixFactor.matchType,
      customerEmail: effectiveCustomerEmail,
      customerPhone: submittedSender,
    });

    const display = parseDisplayMetadata(intent.displayJson, merchant.storeName, payload.orderId);
    const actions = parseActionsList(intent.actionsJson);

    const verifiedData = {
      paymentIntentId: intent.id,
      merchantId: merchant.id,
      externalRefId: payload.orderId,
      externalOrderId: payload.orderId,
      vertical: intent.vertical,
      provider: matchedSms.provider,
      trxId: submittedTrxId,
      amount: matchedSms.amount,
      baseAmount: effectiveBaseAmount,
      uniqueAmount: effectiveUniqueAmount,
      paidAmount: matchedSms.amount,
      matchType: sixFactor.matchType,
      senderNumber: matchedSms.senderNumber,
      resolutionSource: 'AUTO_SMS',
      stateVersion: updatedIntent?.stateVersion ?? intent.stateVersion + 1,
      status: 'VERIFIED',
      callbackUrl: intent.callbackUrl,
      verifiedAt: now.getTime(),
    };

    safeWaitUntil(
      ctx,
      Promise.allSettled([
        dispatchWebhook(
          db,
          merchant,
          'payment.verified',
          verifiedData,
          1,
          undefined,
          intent.callbackUrl || undefined,
          env
        ),
        sendDynamicPushToMerchantDevices(db, env, merchant, {
          event: 'payment.verified',
          paymentIntentId: intent.id,
          externalRefId: payload.orderId,
          appName: display.appName || merchant.storeName,
          appDomain: display.appDomain,
          category: display.category || intent.vertical,
          referenceLabel: display.referenceLabel,
          title: 'Payment Verified',
          subtitle: display.subtitle || `TrxID ${submittedTrxId}`,
          amountFormatted: `৳${matchedSms.amount}`,
          provider: matchedSms.provider,
          paymentStatus: 'VERIFIED',
          adminDeepLink: display.adminDeepLink,
          actions,
        }),
        sendTelegramOfficeAlert(
          merchant,
          `✅ Auto-Verified [${display.appName || merchant.storeName}]\nRef: ${payload.orderId}\nAmount: ৳${matchedSms.amount} (${matchedSms.provider})\nTrxID: ${submittedTrxId}`
        ),
        notifyPaymentVerifiedInvoiceEmail(db, env, {
          merchantId: merchant.id,
          storeName: display.appName || merchant.storeName,
          externalRefId: payload.orderId,
          paymentIntentId: intent.id,
          customerEmail: realCustomerEmail,
          customerName: intentCustomer.name,
          customerPhone: intentCustomer.phone || submittedSender,
          baseAmount: effectiveBaseAmount,
          uniqueAmount: effectiveUniqueAmount,
          paidAmount: matchedSms.amount,
          offsetCents:
            activeSession?.offsetCents ??
            Math.round((effectiveUniqueAmount - effectiveBaseAmount) * 100),
          provider: matchedSms.provider,
          trxId: submittedTrxId,
          senderNumber: matchedSms.senderNumber,
          matchType: sixFactor.matchType,
          resolutionSource: 'AUTO_SMS',
          verifiedAt: now,
        }),
      ])
    );

    return {
      status: 'VERIFIED',
      paymentIntentId: intent.id,
      trxId: submittedTrxId,
      amount: matchedSms.amount,
      baseAmount: effectiveBaseAmount,
      uniqueAmount: effectiveUniqueAmount,
      paidAmount: matchedSms.amount,
      matchType: sixFactor.matchType,
      provider: matchedSms.provider,
      customerEmail: realCustomerEmail,
      deviceOnline: deviceStatus.online,
      receiptPolicy: merchant.receiptPolicy,
      stateVersion: updatedIntent?.stateVersion ?? intent.stateVersion + 1,
    };
  }

  // Deferred Queue Flow (Phone Offline / SMS Delayed)
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
    if (payloadRealEmail) {
      await db
        .update(verificationQueue)
        .set({ customerEmail: payloadRealEmail })
        .where(eq(verificationQueue.id, existingQueue[0].id));
    }
    return {
      status: 'PENDING_VERIFICATION',
      paymentIntentId: intent.id,
      trxId: submittedTrxId,
      customerEmail: realCustomerEmail,
      deviceOnline: deviceStatus.online,
      receiptPolicy: merchant.receiptPolicy,
      message: 'Verification already queued. Confirmation will dispatch automatically.',
      expiresAt: existingQueue[0].expiresAt,
      stateVersion: intent.stateVersion,
    };
  }

  const graceMinutes = merchant.gracePeriodMinutes || 60;
  const graceExpiresAt = new Date(now.getTime() + graceMinutes * 60 * 1000);
  const queueId = `que_${generateSecureToken(16)}`;

  await db.insert(verificationQueue).values({
    id: queueId,
    merchantId: merchant.id,
    paymentIntentId: intent.id,
    provider: payload.provider,
    externalOrderId: payload.orderId,
    customerEmail: effectiveCustomerEmail,
    expectedAmount: effectiveBaseAmount,
    baseAmount: effectiveBaseAmount,
    uniqueAmount: effectiveUniqueAmount,
    submittedAmount,
    submittedTrxId,
    submittedSender,
    receiptAssetId: effectiveReceiptAssetId,
    receiptUrl: effectiveReceiptUrl,
    status: 'WAITING_FOR_SMS',
    expiresAt: graceExpiresAt,
    createdAt: now,
  });

  if (activeSession && activeSession.status === 'OPEN') {
    await db
      .update(checkoutSessions)
      .set({ status: 'SUBMITTED', provider: payload.provider })
      .where(eq(checkoutSessions.id, activeSession.id));
  }

  const updatedIntents = await db
    .update(paymentIntents)
    .set({
      status: 'WAITING_FOR_SMS',
      provider: payload.provider,
      trxId: submittedTrxId,
      senderNumber: submittedSender,
      paidAmount: submittedAmount,
      receiptAssetId: effectiveReceiptAssetId,
      receiptUrl: effectiveReceiptUrl,
      deviceOnlineAtSubmit: deviceStatus.online,
      graceExpiresAt,
      stateVersion: intent.stateVersion + 1,
      updatedAt: now,
    })
    .where(eq(paymentIntents.id, intent.id))
    .returning();

  const updatedIntent = updatedIntents[0] || intent;

  await db
    .update(merchantOrders)
    .set({
      paymentIntentId: intent.id,
      paymentStatus: 'PENDING_VERIFICATION',
      trxId: submittedTrxId,
      uniqueAmount: effectiveUniqueAmount,
      paidAmount: submittedAmount,
      updatedAt: now,
    })
    .where(
      and(
        eq(merchantOrders.merchantId, merchant.id),
        eq(merchantOrders.externalOrderId, payload.orderId)
      )
    );

  const display = parseDisplayMetadata(updatedIntent.displayJson, merchant.storeName, payload.orderId);
  const actions = parseActionsList(updatedIntent.actionsJson);

  // Immediately emit <2s `payment.submitted` webhook so client storefront sees buyer proof right away!
  const submittedPayload = {
    paymentIntentId: updatedIntent.id,
    merchantId: merchant.id,
    externalRefId: payload.orderId,
    externalOrderId: payload.orderId,
    vertical: updatedIntent.vertical,
    provider: payload.provider,
    trxId: submittedTrxId,
    senderNumber: submittedSender,
    baseAmount: effectiveBaseAmount,
    uniqueAmount: effectiveUniqueAmount,
    paidAmount: submittedAmount,
    receiptUrl: effectiveReceiptUrl,
    deviceOnline: deviceStatus.online,
    stateVersion: updatedIntent.stateVersion,
    status: 'WAITING_FOR_SMS',
    graceExpiresAt: graceExpiresAt.getTime(),
    callbackUrl: updatedIntent.callbackUrl,
    submittedAt: now.getTime(),
  };

  safeWaitUntil(
    ctx,
    Promise.allSettled([
      dispatchWebhook(
        db,
        merchant,
        'payment.submitted',
        submittedPayload,
        1,
        undefined,
        updatedIntent.callbackUrl || undefined,
        env
      ),
      sendDynamicPushToMerchantDevices(db, env, merchant, {
        event: 'payment.submitted',
        paymentIntentId: updatedIntent.id,
        externalRefId: payload.orderId,
        appName: display.appName || merchant.storeName,
        appDomain: display.appDomain,
        category: display.category || updatedIntent.vertical,
        referenceLabel: display.referenceLabel,
        title: deviceStatus.online ? 'Payment Proof Submitted (Waiting SMS)' : 'Payment Submitted (Device Offline)',
        subtitle: display.subtitle || `TrxID ${submittedTrxId}`,
        amountFormatted: `৳${submittedAmount}`,
        provider: payload.provider,
        paymentStatus: 'WAITING_FOR_SMS',
        adminDeepLink: display.adminDeepLink,
        actions,
      }),
      sendTelegramOfficeAlert(
        merchant,
        `🕒 Payment Submitted [${display.appName || merchant.storeName}]\nRef: ${payload.orderId}\nAmount: ৳${submittedAmount} (${payload.provider})\nTrxID: ${submittedTrxId}\nDevice Online: ${deviceStatus.online ? 'Yes' : 'Offline'}`
      ),
      notifyPaymentSubmittedEmail(db, env, {
        merchantId: merchant.id,
        storeName: display.appName || merchant.storeName,
        externalRefId: payload.orderId,
        customerEmail: realCustomerEmail,
        customerName: intentCustomer.name,
        amount: submittedAmount,
        provider: payload.provider,
        trxId: submittedTrxId,
        senderNumber: submittedSender,
        status: 'PENDING_VERIFICATION',
        submittedAt: now,
      }),
    ])
  );

  return {
    status: 'PENDING_VERIFICATION',
    paymentIntentId: updatedIntent.id,
    trxId: submittedTrxId,
    baseAmount: effectiveBaseAmount,
    uniqueAmount: effectiveUniqueAmount,
    paidAmount: submittedAmount,
    provider: payload.provider,
    customerEmail: realCustomerEmail,
    deviceOnline: deviceStatus.online,
    receiptPolicy: merchant.receiptPolicy,
    stateVersion: updatedIntent.stateVersion,
    message: deviceStatus.online
      ? 'Verification queued. Confirmation will be sent automatically once SMS arrives.'
      : 'Companion phone is offline. Your proof has been logged and sent to the store admin.',
    expiresAt: graceExpiresAt,
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
  paymentIntentId?: string;
  trxId?: string;
  amount?: number;
  matchType?: string | null;
  escalationReason?: string | null;
  receiptUrl?: string | null;
  customerEmail?: string | null;
  verifiedAt?: Date;
}> {
  const intentRows = await db
    .select()
    .from(paymentIntents)
    .where(and(eq(paymentIntents.merchantId, merchantId), eq(paymentIntents.externalRefId, orderId)))
    .limit(1);

  const intent = intentRows[0];
  if (intent) {
    const customerEmail = extractRealCustomerEmail(
      extractCustomerFromJson(intent.customerJson).email
    );
    if (intent.status === 'VERIFIED') {
      return {
        status: 'VERIFIED',
        paymentIntentId: intent.id,
        trxId: intent.trxId || undefined,
        amount: intent.paidAmount ?? intent.uniqueAmount,
        matchType: intent.matchType,
        receiptUrl: intent.receiptUrl,
        customerEmail,
        verifiedAt: intent.verifiedAt || undefined,
      };
    }
    if (intent.status === 'MANUAL_REVIEW_REQUIRED') {
      return {
        status: 'MANUAL_REVIEW_REQUIRED',
        paymentIntentId: intent.id,
        trxId: intent.trxId || undefined,
        amount: intent.paidAmount ?? intent.uniqueAmount,
        escalationReason: intent.escalationReason,
        receiptUrl: intent.receiptUrl,
        customerEmail,
      };
    }
    if (intent.status === 'WAITING_FOR_SMS') {
      return {
        status: 'PENDING_VERIFICATION',
        paymentIntentId: intent.id,
        trxId: intent.trxId || undefined,
        amount: intent.paidAmount ?? intent.uniqueAmount,
        receiptUrl: intent.receiptUrl,
        customerEmail,
      };
    }
    if (intent.status === 'REJECTED' || intent.status === 'EXPIRED') {
      return {
        status: intent.status,
        paymentIntentId: intent.id,
        trxId: intent.trxId || undefined,
        customerEmail,
      };
    }
  }

  const verifiedLedger = await db
    .select()
    .from(smsLedger)
    .where(and(eq(smsLedger.merchantId, merchantId), eq(smsLedger.externalOrderId, orderId)))
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
    const queueEmail = extractRealCustomerEmail(queueItem[0].customerEmail);
    if (queueItem[0].status === 'MATCHED' || queueItem[0].status === 'MANUALLY_APPROVED') {
      return { status: 'VERIFIED', customerEmail: queueEmail };
    }
    if (queueItem[0].status === 'MANUAL_REVIEW_REQUIRED') {
      return {
        status: 'MANUAL_REVIEW_REQUIRED',
        escalationReason: queueItem[0].escalationReason,
        receiptUrl: queueItem[0].receiptUrl,
        customerEmail: queueEmail,
      };
    }
    if (queueItem[0].status === 'MANUALLY_REJECTED') {
      return { status: 'REJECTED', customerEmail: queueEmail };
    }
    if (queueItem[0].status === 'EXPIRED') {
      return { status: 'EXPIRED', customerEmail: queueEmail };
    }
    return { status: 'PENDING_VERIFICATION', customerEmail: queueEmail };
  }

  return { status: 'UNINITIALIZED' };
}
