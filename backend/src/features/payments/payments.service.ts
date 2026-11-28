import { and, desc, eq, gt, inArray, like, lte, or, sql, type SQL } from 'drizzle-orm';
import type { Context } from 'hono';
import type { AppDb } from '../../db/client';
import {
  checkoutSessions,
  consumedTrxIds,
  merchantOrders,
  merchantProjects,
  paymentIntents,
  smsLedger,
  verificationQueue,
  type MerchantProjectRecord,
  type MerchantRecord,
  type PaymentIntentRecord,
  type ResolutionSource,
} from '../../db/schema';
import { createSignedSessionToken, generateSecureToken } from '../../shared/crypto';
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from '../../shared/errors';
import { safeWaitUntil } from '../../shared/middleware';
import { sanitizePhoneNumber } from '../../shared/parsers/mfs';
import { parseAllowedOrigins, validateSafeWebhookUrl } from '../../shared/ssrf';
import type { AppContextEnv, AuthType, Env } from '../../shared/types';
import { emitMerchantRealtimeEvent } from '../realtime/realtime.service';
import {
  getActiveRotatedWallet,
  getAllActiveRotatedWallets,
  incrementWalletVolume,
} from '../wallets/wallets.service';
import {
  loadProjectById,
  resolveEffectiveProjectConfig,
  resolveProjectDispatchContext,
  resolveProjectRotatedWallets,
} from '../projects/projects.service';
import {
  dispatchWebhook,
  sendDynamicPushToMerchantDevices,
  sendTelegramOfficeAlert,
} from '../webhooks/webhook.dispatcher';
import {
  notifyPaymentVerifiedInvoiceEmail,
  resolveCustomerEmailForOrder,
} from '../notifications/payment-email.service';
import type {
  BackfillPaymentIntentInput,
  CreatePaymentIntentInput,
  ListPaymentIntentsQuery,
  PaymentActionTriggerInput,
  ResolvePaymentInput,
} from './payments.schema';
import {
  computeDeviceOnlineStatus,
  parseActionsList,
  parseDisplayMetadata,
  syncVerifiedOrderAndSession,
  type DeviceStatusSnapshot,
} from './verification.engine';

const OPEN_INTENT_DEFAULT_TTL_MINUTES = 15;

export function resolvePublicOrigin(requestUrl: string, productionDomain?: string): string {
  const parsed = new URL(requestUrl);
  if (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') {
    return parsed.origin;
  }
  if (productionDomain?.trim()) {
    const clean = productionDomain.trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '');
    return `https://${clean}`;
  }
  return parsed.origin;
}

/**
 * Creates a checkout session using the exact order baseAmount (no extra poisha offset),
 * automatically expiring stale OPEN sessions first.
 */
export async function reserveUniqueCheckoutSession(
  db: AppDb,
  params: {
    merchantId: string;
    projectId?: string | null;
    paymentIntentId?: string | null;
    vertical?: typeof checkoutSessions.$inferInsert.vertical;
    externalOrderId: string;
    customerEmail: string;
    baseAmount: number;
    provider?: typeof checkoutSessions.$inferInsert.provider;
    displayJson?: string | null;
    actionsJson?: string | null;
    expiresAt: Date;
  }
): Promise<{
  sessionId: string;
  uniqueAmount: number;
  offsetCents: number;
  expiresAt: Date;
}> {
  const now = new Date();

  // Clear expired unsubmitted OPEN sessions
  await db
    .update(checkoutSessions)
    .set({ status: 'EXPIRED' })
    .where(
      and(
        eq(checkoutSessions.merchantId, params.merchantId),
        eq(checkoutSessions.status, 'OPEN'),
        lte(checkoutSessions.expiresAt, now)
      )
    );

  // Drop legacy unique amount index if an older DB instance still has it
  await db.run(sql.raw('DROP INDEX IF EXISTS `uq_active_unique_amount`')).catch(() => {});

  const uniqueAmount = Math.round(params.baseAmount * 100) / 100;
  const sessionId = `chk_${generateSecureToken(16)}`;

  await db.insert(checkoutSessions).values({
    id: sessionId,
    merchantId: params.merchantId,
    projectId: params.projectId ?? null,
    paymentIntentId: params.paymentIntentId ?? null,
    vertical: params.vertical ?? 'ecommerce',
    externalOrderId: params.externalOrderId,
    customerEmail: params.customerEmail,
    baseAmount: uniqueAmount,
    uniqueAmount,
    offsetCents: 0,
    provider: params.provider ?? null,
    status: 'OPEN',
    displayJson: params.displayJson ?? null,
    actionsJson: params.actionsJson ?? null,
    expiresAt: params.expiresAt,
    createdAt: now,
  });

  return {
    sessionId,
    uniqueAmount,
    offsetCents: 0,
    expiresAt: params.expiresAt,
  };
}

/**
 * Formats a PaymentIntent DB row into a clean API representation.
 */
export function formatPaymentIntentView(
  intent: PaymentIntentRecord,
  storeName?: string,
  projectName?: string | null
) {
  let customer: Record<string, unknown> | null = null;
  let metadata: Record<string, unknown> | null = null;
  let resolvedBy: Record<string, unknown> | null = null;

  try {
    customer = intent.customerJson ? JSON.parse(intent.customerJson) : null;
  } catch {
    customer = null;
  }
  try {
    metadata = intent.metadataJson ? JSON.parse(intent.metadataJson) : null;
  } catch {
    metadata = null;
  }
  try {
    resolvedBy = intent.resolvedByJson ? JSON.parse(intent.resolvedByJson) : null;
  } catch {
    resolvedBy = null;
  }

  return {
    id: intent.id,
    merchantId: intent.merchantId,
    projectId: intent.projectId ?? null,
    projectName: projectName ?? null,
    vertical: intent.vertical,
    externalRefId: intent.externalRefId,
    verificationMode: intent.verificationMode,
    status: intent.status,
    baseAmount: intent.baseAmount,
    uniqueAmount: intent.uniqueAmount,
    paidAmount: intent.paidAmount,
    provider: intent.provider,
    trxId: intent.trxId,
    senderNumber: intent.senderNumber,
    receiptAssetId: intent.receiptAssetId,
    receiptUrl: intent.receiptUrl,
    matchType: intent.matchType,
    trustFlag: intent.trustFlag,
    deviceOnlineAtSubmit: intent.deviceOnlineAtSubmit,
    smsLedgerId: intent.smsLedgerId,
    smsReconciliationState: intent.smsReconciliationState,
    escalationReason: intent.escalationReason,
    resolutionSource: intent.resolutionSource,
    resolvedBy,
    rejectionReason: intent.rejectionReason,
    callbackUrl: intent.callbackUrl,
    returnUrl: intent.returnUrl,
    cancelUrl: intent.cancelUrl,
    customer,
    display: parseDisplayMetadata(intent.displayJson, storeName || 'ORBIT Merchant', intent.externalRefId),
    actions: parseActionsList(intent.actionsJson),
    metadata,
    stateVersion: intent.stateVersion,
    submitAttempts: intent.submitAttempts,
    graceExpiresAt: intent.graceExpiresAt,
    expiresAt: intent.expiresAt,
    verifiedAt: intent.verifiedAt,
    resolvedAt: intent.resolvedAt,
    createdAt: intent.createdAt,
    updatedAt: intent.updatedAt,
  };
}

/**
 * Creates (or idempotently returns) a Universal Payment Intent + Checkout Session.
 */
export async function createPaymentIntent(
  db: AppDb,
  env: Env,
  merchant: MerchantRecord,
  input: CreatePaymentIntentInput,
  origin: string,
  project?: MerchantProjectRecord | null
) {
  const baseAmount = Math.round(input.amount * 100) / 100;
  if (baseAmount <= 0) {
    throw new BadRequestError('Amount must be greater than zero');
  }

  const effective = resolveEffectiveProjectConfig(merchant, project);
  const callbackUrl = input.callbackUrl?.trim() || null;
  if (callbackUrl) {
    validateSafeWebhookUrl(callbackUrl, env, effective.allowedCallbackOrigins);
  }

  const wallets = await resolveProjectRotatedWallets(db, merchant.id, project, input.provider, env);

  if (wallets.length === 0) {
    throw new BadRequestError(
      project && project.walletSelectionMode === 'SPECIFIC'
        ? `Project '${project.name}' has no active SIM wallets assigned yet.`
        : 'Merchant has not configured an active MFS receiving number yet. Please add a number in SIM Pool.'
    );
  }

  const now = new Date();
  const deviceStatus: DeviceStatusSnapshot = await computeDeviceOnlineStatus(db, env, merchant);

  // Check idempotency on (merchantId, externalRefId)
  const existingIntentRows = await db
    .select()
    .from(paymentIntents)
    .where(
      and(
        eq(paymentIntents.merchantId, merchant.id),
        eq(paymentIntents.externalRefId, input.externalRefId)
      )
    )
    .limit(1);

  const existingIntent = existingIntentRows[0];
  if (existingIntent) {
    if (project && existingIntent.projectId !== project.id) {
      throw new ForbiddenError(
        `External reference '${input.externalRefId}' belongs to a different sub-project`
      );
    }

    const existingSessionRows = await db
      .select()
      .from(checkoutSessions)
      .where(
        and(
          eq(checkoutSessions.merchantId, merchant.id),
          eq(checkoutSessions.paymentIntentId, existingIntent.id)
        )
      )
      .orderBy(desc(checkoutSessions.createdAt))
      .limit(1);

    let session = existingSessionRows[0];
    if (!session && existingIntent.status === 'OPEN') {
      const reserved = await reserveUniqueCheckoutSession(db, {
        merchantId: merchant.id,
        projectId: existingIntent.projectId ?? null,
        paymentIntentId: existingIntent.id,
        vertical: existingIntent.vertical,
        externalOrderId: existingIntent.externalRefId,
        customerEmail: input.customer?.email || 'buyer@orbitsaas.cloud',
        baseAmount: existingIntent.baseAmount,
        provider: input.provider ?? existingIntent.provider,
        displayJson: existingIntent.displayJson,
        actionsJson: existingIntent.actionsJson,
        expiresAt: existingIntent.expiresAt,
      });
      const createdRow = await db
        .select()
        .from(checkoutSessions)
        .where(eq(checkoutSessions.id, reserved.sessionId))
        .limit(1);
      session = createdRow[0];
    }

    const sessionId = session?.id || `chk_${existingIntent.id}`;
    const expiresAt = session?.expiresAt || existingIntent.expiresAt;
    const customerEmail = session?.customerEmail || input.customer?.email || 'buyer@orbitsaas.cloud';

    const sessionToken = await createSignedSessionToken(
      {
        sessionId,
        paymentIntentId: existingIntent.id,
        merchantId: merchant.id,
        projectId: existingIntent.projectId ?? null,
        orderId: existingIntent.externalRefId,
        externalRefId: existingIntent.externalRefId,
        baseAmount: existingIntent.baseAmount,
        uniqueAmount: existingIntent.uniqueAmount,
        offsetCents: session?.offsetCents ?? Math.round((existingIntent.uniqueAmount - existingIntent.baseAmount) * 100),
        amount: existingIntent.uniqueAmount,
        customerEmail,
        exp: expiresAt.getTime(),
      },
      merchant.webhookSecret
    );

    return {
      created: false,
      paymentIntentId: existingIntent.id,
      projectId: existingIntent.projectId ?? null,
      sessionId,
      sessionToken,
      checkoutUrl: `${origin}/checkout/${sessionId}?token=${encodeURIComponent(sessionToken)}`,
      externalRefId: existingIntent.externalRefId,
      vertical: existingIntent.vertical,
      status: existingIntent.status,
      baseAmount: existingIntent.baseAmount,
      uniqueAmount: existingIntent.uniqueAmount,
      offsetCents:
        session?.offsetCents ??
        Math.round((existingIntent.uniqueAmount - existingIntent.baseAmount) * 100),
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
      verificationMode: existingIntent.verificationMode,
      receiptPolicy: merchant.receiptPolicy,
      deviceStatus,
      expiresAt,
      display: parseDisplayMetadata(existingIntent.displayJson, effective.appName, existingIntent.externalRefId),
      actions: parseActionsList(existingIntent.actionsJson),
    };
  }

  const verificationMode = input.verificationMode ?? effective.verificationMode;
  const ttlMinutes = input.expiresInMinutes || OPEN_INTENT_DEFAULT_TTL_MINUTES;
  const expiresAt = new Date(now.getTime() + ttlMinutes * 60 * 1000);
  const paymentIntentId = `pay_${generateSecureToken(16)}`;
  const customerEmail = input.customer?.email?.trim() || 'buyer@orbitsaas.cloud';
  const displayJson = input.display ? JSON.stringify(input.display) : null;
  const actionsJson = input.actions ? JSON.stringify(input.actions) : null;
  const customerJson = input.customer ? JSON.stringify(input.customer) : null;
  const metadataJson = input.metadata ? JSON.stringify(input.metadata) : null;

  const reserved = await reserveUniqueCheckoutSession(db, {
    merchantId: merchant.id,
    projectId: project?.id ?? null,
    paymentIntentId,
    vertical: input.vertical,
    externalOrderId: input.externalRefId,
    customerEmail,
    baseAmount,
    provider: input.provider ?? null,
    displayJson,
    actionsJson,
    expiresAt,
  });

  try {
    await db.insert(paymentIntents).values({
      id: paymentIntentId,
      merchantId: merchant.id,
      projectId: project?.id ?? null,
      vertical: input.vertical,
      externalRefId: input.externalRefId,
      verificationMode,
      status: 'OPEN',
      baseAmount,
      uniqueAmount: reserved.uniqueAmount,
      provider: input.provider ?? null,
      callbackUrl,
      returnUrl: input.returnUrl?.trim() || null,
      cancelUrl: input.cancelUrl?.trim() || null,
      customerJson,
      displayJson,
      actionsJson,
      metadataJson,
      stateVersion: 1,
      submitAttempts: 0,
      expiresAt,
      createdAt: now,
      updatedAt: now,
    });
  } catch (err) {
    // Clean up orphaned checkout session if concurrent intent creation won
    await db.delete(checkoutSessions).where(eq(checkoutSessions.id, reserved.sessionId)).catch(() => {});
    throw err;
  }

  const sessionToken = await createSignedSessionToken(
    {
      sessionId: reserved.sessionId,
      paymentIntentId,
      merchantId: merchant.id,
      projectId: project?.id ?? null,
      orderId: input.externalRefId,
      externalRefId: input.externalRefId,
      baseAmount,
      uniqueAmount: reserved.uniqueAmount,
      offsetCents: reserved.offsetCents,
      amount: reserved.uniqueAmount,
      customerEmail,
      exp: expiresAt.getTime(),
    },
    merchant.webhookSecret
  );

  return {
    created: true,
    paymentIntentId,
    projectId: project?.id ?? null,
    sessionId: reserved.sessionId,
    sessionToken,
    checkoutUrl: `${origin}/checkout/${reserved.sessionId}?token=${encodeURIComponent(sessionToken)}`,
    externalRefId: input.externalRefId,
    vertical: input.vertical,
    status: 'OPEN' as const,
    baseAmount,
    uniqueAmount: reserved.uniqueAmount,
    offsetCents: reserved.offsetCents,
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
    verificationMode,
    receiptPolicy: merchant.receiptPolicy,
    deviceStatus,
    expiresAt,
    display: parseDisplayMetadata(displayJson, effective.appName, input.externalRefId),
    actions: parseActionsList(actionsJson),
  };
}

/**
 * Lists payment intents for the authenticated merchant with filtering and pagination.
 */
export async function listPaymentIntents(
  db: AppDb,
  merchant: MerchantRecord,
  query: ListPaymentIntentsQuery
) {
  const conditions: SQL[] = [eq(paymentIntents.merchantId, merchant.id)];

  if (query.projectId) {
    conditions.push(eq(paymentIntents.projectId, query.projectId));
  }
  if (query.status && query.status !== 'ALL') {
    conditions.push(eq(paymentIntents.status, query.status));
  }
  if (query.vertical) {
    conditions.push(eq(paymentIntents.vertical, query.vertical));
  }
  if (query.search && query.search.trim().length > 0) {
    const raw = query.search.trim();
    const term = `%${raw}%`;
    const upper = `%${raw.toUpperCase()}%`;
    conditions.push(
      or(
        like(paymentIntents.id, term),
        like(paymentIntents.externalRefId, term),
        like(paymentIntents.trxId, upper),
        like(paymentIntents.senderNumber, term),
        like(paymentIntents.customerJson, term),
        like(paymentIntents.displayJson, term)
      )!
    );
  }

  const whereClause = and(...conditions);

  const [countRes, rows, projects] = await Promise.all([
    db.select({ count: sql<number>`COUNT(*)` }).from(paymentIntents).where(whereClause),
    db
      .select()
      .from(paymentIntents)
      .where(whereClause)
      .orderBy(desc(paymentIntents.createdAt))
      .limit(query.limit)
      .offset(query.offset),
    db
      .select({ id: merchantProjects.id, name: merchantProjects.name })
      .from(merchantProjects)
      .where(eq(merchantProjects.merchantId, merchant.id)),
  ]);

  const projectNameMap = new Map(projects.map((p) => [p.id, p.name]));

  return {
    items: rows.map((r) =>
      formatPaymentIntentView(
        r,
        merchant.storeName,
        r.projectId ? projectNameMap.get(r.projectId) ?? null : null
      )
    ),
    total: Number(countRes[0]?.count || 0),
    limit: query.limit,
    offset: query.offset,
  };
}

/**
 * Retrieves a single payment intent by paymentIntentId or externalRefId.
 */
export async function getPaymentIntentById(
  db: AppDb,
  merchant: MerchantRecord,
  idOrRef: string
) {
  const rows = await db
    .select()
    .from(paymentIntents)
    .where(
      and(
        eq(paymentIntents.merchantId, merchant.id),
        or(eq(paymentIntents.id, idOrRef), eq(paymentIntents.externalRefId, idOrRef))
      )
    )
    .limit(1);

  const intent = rows[0];
  if (!intent) {
    throw new NotFoundError(`Payment intent '${idOrRef}' not found`);
  }

  const [queueRows, sessionRows, project] = await Promise.all([
    db
      .select()
      .from(verificationQueue)
      .where(
        and(
          eq(verificationQueue.merchantId, merchant.id),
          eq(verificationQueue.externalOrderId, intent.externalRefId)
        )
      )
      .orderBy(desc(verificationQueue.createdAt))
      .limit(1),
    db
      .select()
      .from(checkoutSessions)
      .where(
        and(
          eq(checkoutSessions.merchantId, merchant.id),
          eq(checkoutSessions.paymentIntentId, intent.id)
        )
      )
      .orderBy(desc(checkoutSessions.createdAt))
      .limit(1),
    loadProjectById(db, merchant.id, intent.projectId),
  ]);

  return {
    ...formatPaymentIntentView(intent, merchant.storeName, project?.name ?? null),
    sessionId: sessionRows[0]?.id ?? null,
    queueStatus: queueRows[0]?.status ?? null,
  };
}

function inferResolutionSource(authType?: AuthType): ResolutionSource {
  if (authType === 'device') return 'ORBIT_ANDROID';
  if (authType === 'jwt') return 'ORBIT_DASHBOARD';
  return 'CLIENT_ADMIN';
}

/**
 * Atomically approves or rejects a payment intent (Reverse-Sync & Manual Review Resolution).
 * Enforces stateVersion CAS, writes consumed_trx_ids, tombstones sms_ledger, closes queue/session,
 * syncs merchant_orders, and optionally suppresses webhook echo when triggered from Client Admin.
 */
export async function resolvePaymentIntent(
  db: AppDb,
  env: Env,
  merchant: MerchantRecord,
  idOrRef: string,
  input: ResolvePaymentInput,
  authContext?: { authType?: AuthType; userId?: string; ctx?: Context<AppContextEnv> }
) {
  const rows = await db
    .select()
    .from(paymentIntents)
    .where(
      and(
        eq(paymentIntents.merchantId, merchant.id),
        or(eq(paymentIntents.id, idOrRef), eq(paymentIntents.externalRefId, idOrRef))
      )
    )
    .limit(1);

  const intent = rows[0];
  if (!intent) {
    throw new NotFoundError(`Payment intent '${idOrRef}' not found`);
  }

  if (
    input.expectedStateVersion !== undefined &&
    intent.stateVersion !== input.expectedStateVersion
  ) {
    throw new ConflictError(
      `State version mismatch: expected ${input.expectedStateVersion}, current ${intent.stateVersion}`
    );
  }

  const now = new Date();
  const resolutionSource = input.resolutionSource ?? inferResolutionSource(authContext?.authType);
  const resolvedByJson = JSON.stringify({
    ...(input.resolvedBy || {}),
    ...(authContext?.userId ? { userId: authContext.userId } : {}),
    source: resolutionSource,
  });

  if (input.decision === 'APPROVE') {
    if (intent.status === 'VERIFIED') {
      const resolvedProject = await loadProjectById(db, merchant.id, intent.projectId);
      return {
        paymentIntent: formatPaymentIntentView(intent, merchant.storeName, resolvedProject?.name ?? null),
        alreadyResolved: true,
      };
    }
    if (intent.status === 'REFUNDED' || intent.status === 'EXPIRED') {
      throw new ConflictError(`Cannot approve payment intent in '${intent.status}' status`);
    }

    const normalizedTrxId = (input.trxId || intent.trxId || '').trim().toUpperCase() || null;
    let smsReconciliationState = intent.smsReconciliationState || 'NONE';
    let smsLedgerId = intent.smsLedgerId;
    let matchedLedgerId: string | null = null;
    let needsConsumedInsert = false;

    if (normalizedTrxId) {
      const existingConsumed = await db
        .select()
        .from(consumedTrxIds)
        .where(
          and(
            eq(consumedTrxIds.merchantId, merchant.id),
            eq(consumedTrxIds.trxId, normalizedTrxId)
          )
        )
        .limit(1);

      if (
        existingConsumed[0] &&
        existingConsumed[0].paymentIntentId !== intent.id &&
        existingConsumed[0].externalRefId !== intent.externalRefId
      ) {
        throw new ConflictError(
          `Transaction ID '${normalizedTrxId}' is already consumed by another payment`
        );
      }
      needsConsumedInsert = !existingConsumed[0];

      const ledgerRows = await db
        .select()
        .from(smsLedger)
        .where(and(eq(smsLedger.merchantId, merchant.id), eq(smsLedger.trxId, normalizedTrxId)))
        .limit(1);

      const ledger = ledgerRows[0];
      if (ledger) {
        if (
          ledger.status !== 'UNCLAIMED' &&
          ledger.externalOrderId !== intent.externalRefId &&
          ledger.paymentIntentId !== intent.id
        ) {
          throw new ConflictError(
            `SMS ledger row for '${normalizedTrxId}' is already claimed by order '${ledger.externalOrderId}'`
          );
        }

        matchedLedgerId = ledger.id;
        smsLedgerId = ledger.id;
        smsReconciliationState = 'RECONCILED';
      } else {
        smsReconciliationState = 'PENDING_LATE_SMS';
      }
    }

    if (normalizedTrxId && needsConsumedInsert) {
      try {
        await db.insert(consumedTrxIds).values({
          merchantId: merchant.id,
          trxId: normalizedTrxId,
          provider: intent.provider ?? 'BKASH',
          paymentIntentId: intent.id,
          externalRefId: intent.externalRefId,
          resolutionSource,
          consumedAt: now,
        });
      } catch {
        throw new ConflictError(`Transaction ID '${normalizedTrxId}' was concurrently consumed`);
      }
    }

    const casConditions = [
      eq(paymentIntents.id, intent.id),
      eq(paymentIntents.merchantId, merchant.id),
      eq(paymentIntents.stateVersion, intent.stateVersion),
      inArray(paymentIntents.status, ['OPEN', 'WAITING_FOR_SMS', 'MANUAL_REVIEW_REQUIRED', 'REJECTED']),
    ];

    const updatedRows = await db
      .update(paymentIntents)
      .set({
        status: 'VERIFIED',
        ...(normalizedTrxId ? { trxId: normalizedTrxId } : {}),
        matchType: intent.matchType ?? 'MANUAL_VERIFIED',
        smsLedgerId: smsLedgerId ?? null,
        smsReconciliationState,
        resolutionSource,
        resolvedByJson,
        paidAmount: intent.paidAmount ?? intent.uniqueAmount,
        stateVersion: intent.stateVersion + 1,
        verifiedAt: intent.verifiedAt ?? now,
        resolvedAt: now,
        updatedAt: now,
      })
      .where(and(...casConditions))
      .returning();

    const updatedIntent = updatedRows[0];
    if (!updatedIntent) {
      if (normalizedTrxId && needsConsumedInsert) {
        await db
          .delete(consumedTrxIds)
          .where(
            and(
              eq(consumedTrxIds.merchantId, merchant.id),
              eq(consumedTrxIds.trxId, normalizedTrxId),
              eq(consumedTrxIds.paymentIntentId, intent.id)
            )
          )
          .catch(() => {});
      }
      throw new ConflictError('Payment intent was updated concurrently');
    }

    if (matchedLedgerId) {
      await db
        .update(smsLedger)
        .set({
          status: 'MANUAL_VERIFIED',
          matchType: 'MANUAL_VERIFIED',
          externalOrderId: intent.externalRefId,
          paymentIntentId: intent.id,
          verifiedAt: now,
        })
        .where(eq(smsLedger.id, matchedLedgerId));
    }

    await db
      .update(verificationQueue)
      .set({
        status: 'MANUALLY_APPROVED',
        resolvedAt: now,
      })
      .where(
        and(
          eq(verificationQueue.merchantId, merchant.id),
          or(
            eq(verificationQueue.paymentIntentId, intent.id),
            eq(verificationQueue.externalOrderId, intent.externalRefId)
          ),
          inArray(verificationQueue.status, ['WAITING_FOR_SMS', 'MANUAL_REVIEW_REQUIRED'])
        )
      );

    await syncVerifiedOrderAndSession(db, {
      merchantId: merchant.id,
      projectId: updatedIntent.projectId,
      externalOrderId: intent.externalRefId,
      paymentIntentId: intent.id,
      baseAmount: intent.baseAmount,
      uniqueAmount: intent.uniqueAmount,
      paidAmount: updatedIntent.paidAmount ?? updatedIntent.uniqueAmount,
      trxId: normalizedTrxId || `MAN_${intent.id.slice(-8).toUpperCase()}`,
      matchType: updatedIntent.matchType ?? 'MANUAL_VERIFIED',
      customerPhone: intent.senderNumber,
    });

    if (intent.provider) {
      await incrementWalletVolume(
        db,
        merchant.id,
        intent.provider,
        updatedIntent.paidAmount ?? updatedIntent.uniqueAmount
      );
    }

    const dispatchCtx = await resolveProjectDispatchContext(
      db,
      merchant,
      updatedIntent.projectId,
      updatedIntent.callbackUrl
    );
    const display = parseDisplayMetadata(
      updatedIntent.displayJson,
      dispatchCtx.effective.appName,
      updatedIntent.externalRefId
    );
    const actions = parseActionsList(updatedIntent.actionsJson);

    if (!input.suppressWebhookEcho) {
      safeWaitUntil(
        authContext?.ctx,
        dispatchWebhook(
          db,
          merchant,
          'payment.verified',
          {
            paymentIntentId: updatedIntent.id,
            merchantId: merchant.id,
            projectId: updatedIntent.projectId,
            externalRefId: updatedIntent.externalRefId,
            externalOrderId: updatedIntent.externalRefId,
            vertical: updatedIntent.vertical,
            provider: updatedIntent.provider,
            trxId: updatedIntent.trxId,
            baseAmount: updatedIntent.baseAmount,
            uniqueAmount: updatedIntent.uniqueAmount,
            paidAmount: updatedIntent.paidAmount,
            matchType: updatedIntent.matchType,
            resolutionSource,
            stateVersion: updatedIntent.stateVersion,
            status: 'VERIFIED',
            verifiedAt: now.getTime(),
            callbackUrl: updatedIntent.callbackUrl,
          },
          1,
          undefined,
          dispatchCtx.targetUrlOverride,
          env,
          undefined,
          dispatchCtx.webhookOptions
        )
      );
    }

    emitMerchantRealtimeEvent(
      env,
      'PAYMENT_VERIFIED',
      {
        paymentIntentId: updatedIntent.id,
        projectId: updatedIntent.projectId,
        orderId: updatedIntent.externalRefId,
        trxId: updatedIntent.trxId,
        amount: updatedIntent.paidAmount,
        matchType: updatedIntent.matchType,
        provider: updatedIntent.provider,
        resolutionSource,
      },
      merchant.id,
      authContext?.ctx
    );

    const resolvedCustomer = await resolveCustomerEmailForOrder(db, {
      merchantId: merchant.id,
      externalRefId: updatedIntent.externalRefId,
      paymentIntentId: updatedIntent.id,
      customerJson: updatedIntent.customerJson,
    });

    safeWaitUntil(
      authContext?.ctx,
      Promise.allSettled([
        sendDynamicPushToMerchantDevices(db, env, merchant, {
          event: 'payment.verified',
          paymentIntentId: updatedIntent.id,
          externalRefId: updatedIntent.externalRefId,
          appName: display.appName || dispatchCtx.effective.appName,
          appDomain: display.appDomain,
          category: display.category || updatedIntent.vertical,
          referenceLabel: display.referenceLabel,
          title: `Payment Verified (${resolutionSource})`,
          subtitle: display.subtitle,
          amountFormatted: `৳${updatedIntent.paidAmount ?? updatedIntent.uniqueAmount}`,
          provider: updatedIntent.provider ?? undefined,
          paymentStatus: 'VERIFIED',
          adminDeepLink: display.adminDeepLink,
          actions,
        }),
        sendTelegramOfficeAlert(
          merchant,
          `✅ Payment Verified [${display.appName || dispatchCtx.effective.appName}]\nRef: ${updatedIntent.externalRefId}\nAmount: ৳${updatedIntent.paidAmount ?? updatedIntent.uniqueAmount}\nTrxID: ${updatedIntent.trxId || 'Manual'}\nSource: ${resolutionSource}`,
          dispatchCtx.project
        ),
        ...(resolvedCustomer.email && env
          ? [
              notifyPaymentVerifiedInvoiceEmail(db, env, {
                merchantId: merchant.id,
                storeName: display.appName || dispatchCtx.effective.appName,
                externalRefId: updatedIntent.externalRefId,
                paymentIntentId: updatedIntent.id,
                customerEmail: resolvedCustomer.email,
                customerName: resolvedCustomer.name,
                customerPhone: resolvedCustomer.phone || updatedIntent.senderNumber,
                baseAmount: updatedIntent.baseAmount,
                uniqueAmount: updatedIntent.uniqueAmount,
                paidAmount: updatedIntent.paidAmount ?? updatedIntent.uniqueAmount,
                offsetCents: Math.round(
                  (updatedIntent.uniqueAmount - updatedIntent.baseAmount) * 100
                ),
                provider: updatedIntent.provider,
                trxId: updatedIntent.trxId,
                senderNumber: updatedIntent.senderNumber,
                matchType: updatedIntent.matchType,
                resolutionSource,
                verifiedAt: updatedIntent.verifiedAt ?? now,
              }),
            ]
          : []),
      ])
    );

    return {
      paymentIntent: formatPaymentIntentView(
        updatedIntent,
        merchant.storeName,
        dispatchCtx.project?.name ?? null
      ),
      alreadyResolved: false,
    };
  }

  // REJECT decision
  if (intent.status === 'REJECTED') {
    const resolvedProject = await loadProjectById(db, merchant.id, intent.projectId);
    return {
      paymentIntent: formatPaymentIntentView(intent, merchant.storeName, resolvedProject?.name ?? null),
      alreadyResolved: true,
    };
  }
  if (intent.status === 'VERIFIED' || intent.status === 'REFUNDED' || intent.status === 'EXPIRED') {
    throw new ConflictError(`Cannot reject payment intent in '${intent.status}' status`);
  }

  const updatedRows = await db
    .update(paymentIntents)
    .set({
      status: 'REJECTED',
      rejectionReason: input.reason || 'Rejected during manual review',
      resolutionSource,
      resolvedByJson,
      stateVersion: intent.stateVersion + 1,
      resolvedAt: now,
      updatedAt: now,
    })
    .where(
      and(
        eq(paymentIntents.id, intent.id),
        eq(paymentIntents.merchantId, merchant.id),
        eq(paymentIntents.stateVersion, intent.stateVersion),
        inArray(paymentIntents.status, ['OPEN', 'WAITING_FOR_SMS', 'MANUAL_REVIEW_REQUIRED'])
      )
    )
    .returning();

  const updatedIntent = updatedRows[0];
  if (!updatedIntent) {
    throw new ConflictError('Payment intent was updated concurrently');
  }

  await Promise.all([
    db
      .update(verificationQueue)
      .set({
        status: 'MANUALLY_REJECTED',
        resolvedAt: now,
      })
      .where(
        and(
          eq(verificationQueue.merchantId, merchant.id),
          or(
            eq(verificationQueue.paymentIntentId, intent.id),
            eq(verificationQueue.externalOrderId, intent.externalRefId)
          ),
          inArray(verificationQueue.status, ['WAITING_FOR_SMS', 'MANUAL_REVIEW_REQUIRED'])
        )
      ),
    db
      .update(checkoutSessions)
      .set({ status: 'REJECTED' })
      .where(
        and(
          eq(checkoutSessions.merchantId, merchant.id),
          or(
            eq(checkoutSessions.paymentIntentId, intent.id),
            eq(checkoutSessions.externalOrderId, intent.externalRefId)
          ),
          inArray(checkoutSessions.status, ['OPEN', 'SUBMITTED', 'ESCALATED'])
        )
      ),
    db
      .update(merchantOrders)
      .set({ paymentStatus: 'FAILED', updatedAt: now })
      .where(
        and(
          eq(merchantOrders.merchantId, merchant.id),
          eq(merchantOrders.externalOrderId, intent.externalRefId)
        )
      ),
  ]);

  const dispatchCtx = await resolveProjectDispatchContext(
    db,
    merchant,
    updatedIntent.projectId,
    updatedIntent.callbackUrl
  );
  const display = parseDisplayMetadata(
    updatedIntent.displayJson,
    dispatchCtx.effective.appName,
    updatedIntent.externalRefId
  );

  if (!input.suppressWebhookEcho) {
    safeWaitUntil(
      authContext?.ctx,
      dispatchWebhook(
        db,
        merchant,
        'payment.rejected',
        {
          paymentIntentId: updatedIntent.id,
          merchantId: merchant.id,
          projectId: updatedIntent.projectId,
          externalRefId: updatedIntent.externalRefId,
          externalOrderId: updatedIntent.externalRefId,
          vertical: updatedIntent.vertical,
          provider: updatedIntent.provider,
          trxId: updatedIntent.trxId,
          reason: updatedIntent.rejectionReason,
          resolutionSource,
          stateVersion: updatedIntent.stateVersion,
          status: 'REJECTED',
          rejectedAt: now.getTime(),
          callbackUrl: updatedIntent.callbackUrl,
        },
        1,
        undefined,
        dispatchCtx.targetUrlOverride,
        env,
        undefined,
        dispatchCtx.webhookOptions
      )
    );
  }

  emitMerchantRealtimeEvent(
    env,
    'ORDER_UPDATED',
    {
      paymentIntentId: updatedIntent.id,
      projectId: updatedIntent.projectId,
      orderId: updatedIntent.externalRefId,
      status: 'REJECTED',
      reason: updatedIntent.rejectionReason,
    },
    merchant.id,
    authContext?.ctx
  );

  safeWaitUntil(
    authContext?.ctx,
    sendTelegramOfficeAlert(
      merchant,
      `❌ Payment Rejected [${display.appName || dispatchCtx.effective.appName}]\nRef: ${updatedIntent.externalRefId}\nReason: ${updatedIntent.rejectionReason}`,
      dispatchCtx.project
    )
  );

  return {
    paymentIntent: formatPaymentIntentView(
      updatedIntent,
      merchant.storeName,
      dispatchCtx.project?.name ?? null
    ),
    alreadyResolved: false,
  };
}

/**
 * Validates and dispatches a client-declared dynamic action webhook (action.<actionId>).
 */
export async function triggerPaymentAction(
  db: AppDb,
  env: Env,
  merchant: MerchantRecord,
  idOrRef: string,
  input: PaymentActionTriggerInput,
  actor?: { userId?: string; authType?: AuthType }
) {
  const rows = await db
    .select()
    .from(paymentIntents)
    .where(
      and(
        eq(paymentIntents.merchantId, merchant.id),
        or(eq(paymentIntents.id, idOrRef), eq(paymentIntents.externalRefId, idOrRef))
      )
    )
    .limit(1);

  const intent = rows[0];
  if (!intent) {
    throw new NotFoundError(`Payment intent '${idOrRef}' not found`);
  }

  const actions = parseActionsList(intent.actionsJson);
  const matchedAction = actions.find((a) => a.id === input.actionId);
  if (!matchedAction) {
    throw new BadRequestError(
      `Action '${input.actionId}' is not declared on payment intent '${intent.id}'`
    );
  }

  const eventName = matchedAction.webhookEvent || `action.${matchedAction.id}`;
  const now = new Date();
  const dispatchCtx = await resolveProjectDispatchContext(
    db,
    merchant,
    intent.projectId,
    intent.callbackUrl
  );

  const webhookResult = await dispatchWebhook(
    db,
    merchant,
    eventName,
    {
      paymentIntentId: intent.id,
      merchantId: merchant.id,
      projectId: intent.projectId,
      externalRefId: intent.externalRefId,
      externalOrderId: intent.externalRefId,
      vertical: intent.vertical,
      actionId: matchedAction.id,
      actionLabel: matchedAction.label,
      paymentStatus: intent.status,
      note: input.note,
      payload: input.payload,
      actorUserId: actor?.userId,
      actorAuthType: actor?.authType,
      callbackUrl: intent.callbackUrl,
      triggeredAt: now.toISOString(),
    },
    1,
    undefined,
    dispatchCtx.targetUrlOverride,
    env,
    undefined,
    dispatchCtx.webhookOptions
  );

  return {
    paymentIntentId: intent.id,
    externalRefId: intent.externalRefId,
    actionId: matchedAction.id,
    event: eventName,
    webhookDispatched: webhookResult.success,
    deliveryId: webhookResult.deliveryId,
    statusCode: webhookResult.statusCode,
  };
}

/**
 * Backfills Tier-4 outage fallback payments submitted locally in client storefronts when Orbit was unreachable.
 */
export async function backfillPaymentIntent(
  db: AppDb,
  env: Env,
  merchant: MerchantRecord,
  input: BackfillPaymentIntentInput,
  project?: MerchantProjectRecord | null
) {
  const existingRows = await db
    .select()
    .from(paymentIntents)
    .where(
      and(
        eq(paymentIntents.merchantId, merchant.id),
        eq(paymentIntents.externalRefId, input.externalRefId)
      )
    )
    .limit(1);

  if (existingRows[0]) {
    if (project && existingRows[0].projectId !== project.id) {
      throw new ForbiddenError(
        `External reference '${input.externalRefId}' belongs to a different sub-project`
      );
    }
    return {
      created: false,
      paymentIntent: formatPaymentIntentView(existingRows[0], merchant.storeName),
    };
  }

  const effective = resolveEffectiveProjectConfig(merchant, project);
  const callbackUrl = input.callbackUrl?.trim() || null;
  if (callbackUrl) {
    validateSafeWebhookUrl(callbackUrl, env, effective.allowedCallbackOrigins);
  }

  const now = new Date();
  const createdAt = input.createdAt ? new Date(input.createdAt) : now;
  const paymentIntentId = `pay_${generateSecureToken(16)}`;
  const normalizedTrxId = input.trxId ? input.trxId.trim().toUpperCase() : null;
  const normalizedSender = input.senderNumber
    ? sanitizePhoneNumber(input.senderNumber, input.provider)
    : null;
  const baseAmount = Math.round(input.baseAmount * 100) / 100;
  const uniqueAmount = Math.round((input.uniqueAmount ?? baseAmount) * 100) / 100;
  const paidAmount = input.paidAmount ? Math.round(input.paidAmount * 100) / 100 : null;
  const expiresAt = new Date(createdAt.getTime() + 60 * 60 * 1000);

  await db.insert(paymentIntents).values({
    id: paymentIntentId,
    merchantId: merchant.id,
    projectId: project?.id ?? null,
    vertical: input.vertical,
    externalRefId: input.externalRefId,
    verificationMode: input.verificationMode ?? effective.verificationMode,
    status: input.status,
    baseAmount,
    uniqueAmount,
    paidAmount,
    provider: input.provider ?? null,
    trxId: normalizedTrxId,
    senderNumber: normalizedSender,
    deviceOnlineAtSubmit: false,
    escalationReason: input.status === 'MANUAL_REVIEW_REQUIRED' ? 'DEVICE_OFFLINE_IMMEDIATE' : null,
    callbackUrl,
    customerJson: input.customer ? JSON.stringify(input.customer) : null,
    displayJson: input.display ? JSON.stringify(input.display) : null,
    actionsJson: input.actions ? JSON.stringify(input.actions) : null,
    metadataJson: JSON.stringify({ ...(input.metadata || {}), backfilled: true }),
    stateVersion: 1,
    submitAttempts: normalizedTrxId ? 1 : 0,
    expiresAt,
    verifiedAt: input.status === 'VERIFIED' ? now : null,
    resolvedAt: input.status === 'VERIFIED' || input.status === 'REJECTED' ? now : null,
    createdAt,
    updatedAt: now,
  });

  if (normalizedTrxId && input.provider && (input.status === 'WAITING_FOR_SMS' || input.status === 'MANUAL_REVIEW_REQUIRED')) {
    await db.insert(verificationQueue).values({
      id: `que_${generateSecureToken(16)}`,
      merchantId: merchant.id,
      projectId: project?.id ?? null,
      paymentIntentId,
      provider: input.provider,
      externalOrderId: input.externalRefId,
      customerEmail: input.customer?.email || 'buyer@orbitsaas.cloud',
      expectedAmount: baseAmount,
      baseAmount,
      uniqueAmount,
      submittedAmount: paidAmount ?? uniqueAmount,
      submittedTrxId: normalizedTrxId,
      submittedSender: normalizedSender || '01700000000',
      escalationReason: input.status === 'MANUAL_REVIEW_REQUIRED' ? 'DEVICE_OFFLINE_IMMEDIATE' : null,
      escalatedAt: input.status === 'MANUAL_REVIEW_REQUIRED' ? now : null,
      status: input.status,
      expiresAt,
      createdAt,
    });
  }

  if (normalizedTrxId && input.status === 'VERIFIED') {
    await db
      .insert(consumedTrxIds)
      .values({
        merchantId: merchant.id,
        trxId: normalizedTrxId,
        provider: input.provider ?? 'BKASH',
        paymentIntentId,
        externalRefId: input.externalRefId,
        resolutionSource: 'CLIENT_ADMIN',
        consumedAt: now,
      })
      .onConflictDoNothing();
  }

  const inserted = await db
    .select()
    .from(paymentIntents)
    .where(eq(paymentIntents.id, paymentIntentId))
    .limit(1);

  return {
    created: true,
    paymentIntent: formatPaymentIntentView(inserted[0], merchant.storeName),
  };
}
