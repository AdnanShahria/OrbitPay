import { and, desc, eq, inArray, like, or, sql, type SQL } from 'drizzle-orm';
import type { Context } from 'hono';
import type { AppDb } from '../../db/client';
import {
  consumedTrxIds,
  paymentIntents,
  smsLedger,
  verificationQueue,
  type MerchantRecord,
  type SmsLedgerRecord,
} from '../../db/schema';
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from '../../shared/errors';
import { safeWaitUntil } from '../../shared/middleware';
import type { AppContextEnv, Env } from '../../shared/types';
import { syncVerifiedOrderAndSession } from '../payments/verification.engine';
import { incrementWalletVolume } from '../wallets/wallets.service';
import { dispatchWebhook, sendPushToMerchantDevices } from '../webhooks/webhook.dispatcher';
import {
  notifyPaymentVerifiedInvoiceEmail,
  resolveCustomerEmailForOrder,
} from '../notifications/payment-email.service';
import { resolveProjectDispatchContext } from '../projects/projects.service';
import type { ListTransactionsQuery, ManualMatchInput } from './transactions.schema';

export interface ListTransactionsResult {
  items: SmsLedgerRecord[];
  total: number;
  limit: number;
  offset: number;
}

/**
 * Queries SMS ledger transactions with filtering by status, provider, date, or search term.
 */
export async function listTransactions(
  db: AppDb,
  merchantId: string,
  query: ListTransactionsQuery
): Promise<ListTransactionsResult> {
  const conditions: SQL[] = [eq(smsLedger.merchantId, merchantId)];

  if (query.status && query.status !== 'ALL') {
    conditions.push(eq(smsLedger.status, query.status as any));
  }

  if (query.provider) {
    conditions.push(eq(smsLedger.provider, query.provider));
  }

  if (query.search) {
    const term = `%${query.search.toUpperCase()}%`;
    conditions.push(
      or(
        like(smsLedger.trxId, term),
        like(smsLedger.senderNumber, `%${query.search}%`),
        like(smsLedger.externalOrderId, `%${query.search}%`)
      )!
    );
  }

  if (query.startDate) {
    const startEpoch = Math.floor(new Date(query.startDate).getTime() / 1000);
    conditions.push(sql`${smsLedger.smsReceivedAt} >= ${startEpoch}`);
  }

  if (query.endDate) {
    const endEpoch = Math.floor(new Date(query.endDate).getTime() / 1000);
    conditions.push(sql`${smsLedger.smsReceivedAt} <= ${endEpoch}`);
  }

  const whereClause = and(...conditions);

  const countRes = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(smsLedger)
    .where(whereClause);
  const total = Number(countRes[0]?.count || 0);

  const items = await db
    .select()
    .from(smsLedger)
    .where(whereClause)
    .orderBy(desc(smsLedger.smsReceivedAt))
    .limit(query.limit)
    .offset(query.offset);

  return {
    items,
    total,
    limit: query.limit,
    offset: query.offset,
  };
}

/**
 * Manual Match Resolver
 * Links an UNCLAIMED SMS ledger entry to an external order ID with atomic CAS + consumed_trx_ids.
 */
export async function manualMatchTransaction(
  db: AppDb,
  merchant: MerchantRecord,
  payload: ManualMatchInput,
  fcmServerKeyOrEnv?: string | Env,
  ctx?: Context<AppContextEnv>
): Promise<SmsLedgerRecord> {
  const env = typeof fcmServerKeyOrEnv === 'string' ? undefined : fcmServerKeyOrEnv;
  const existing = await db
    .select()
    .from(smsLedger)
    .where(and(eq(smsLedger.id, payload.smsLedgerId), eq(smsLedger.merchantId, merchant.id)))
    .limit(1);

  const row = existing[0];
  if (!row) {
    throw new NotFoundError(`Transaction '${payload.smsLedgerId}' not found`);
  }

  if (row.status !== 'UNCLAIMED') {
    throw new BadRequestError(`Transaction is already marked as ${row.status}`);
  }

  const existingConsumed = await db
    .select()
    .from(consumedTrxIds)
    .where(and(eq(consumedTrxIds.merchantId, merchant.id), eq(consumedTrxIds.trxId, row.trxId)))
    .limit(1);

  if (existingConsumed[0]) {
    throw new ConflictError(`Transaction ID '${row.trxId}' has already been consumed`);
  }

  const now = new Date();
  const intentRows = await db
    .select()
    .from(paymentIntents)
    .where(
      and(
        eq(paymentIntents.merchantId, merchant.id),
        eq(paymentIntents.externalRefId, payload.externalOrderId)
      )
    )
    .limit(1);
  const intent = intentRows[0];

  if (ctx?.get('projectAuthScoped')) {
    if (!intent || intent.projectId !== ctx.get('projectId')) {
      throw new ForbiddenError('Project credentials cannot manually match orders outside this project');
    }
  }

  const claimed = await db
    .update(smsLedger)
    .set({
      status: 'MANUAL_VERIFIED',
      matchType: 'MANUAL_VERIFIED',
      externalOrderId: payload.externalOrderId,
      paymentIntentId: intent?.id ?? null,
      verifiedAt: now,
    })
    .where(and(eq(smsLedger.id, row.id), eq(smsLedger.status, 'UNCLAIMED')))
    .returning();

  if (!claimed[0]) {
    throw new ConflictError('Transaction was already claimed concurrently');
  }

  const resolutionSource =
    ctx?.get('authType') === 'device' ? 'ORBIT_ANDROID' : 'ORBIT_DASHBOARD';

  try {
    await db.insert(consumedTrxIds).values({
      merchantId: merchant.id,
      trxId: row.trxId,
      provider: row.provider,
      paymentIntentId: intent?.id ?? null,
      externalRefId: payload.externalOrderId,
      resolutionSource,
      consumedAt: now,
    });
  } catch {
    await db
      .update(smsLedger)
      .set({
        status: 'UNCLAIMED',
        matchType: null,
        externalOrderId: null,
        paymentIntentId: null,
        verifiedAt: null,
      })
      .where(eq(smsLedger.id, row.id))
      .catch(() => {});
    throw new ConflictError(`Transaction ID '${row.trxId}' was concurrently consumed`);
  }

  if (intent) {
    const updatedIntents = await db
      .update(paymentIntents)
      .set({
        status: 'VERIFIED',
        provider: row.provider,
        trxId: row.trxId,
        paidAmount: row.amount,
        matchType: 'MANUAL_VERIFIED',
        smsLedgerId: row.id,
        smsReconciliationState: 'RECONCILED',
        resolutionSource,
        stateVersion: intent.stateVersion + 1,
        verifiedAt: now,
        resolvedAt: now,
        updatedAt: now,
      })
      .where(
        and(
          eq(paymentIntents.id, intent.id),
          eq(paymentIntents.stateVersion, intent.stateVersion),
          inArray(paymentIntents.status, ['OPEN', 'WAITING_FOR_SMS', 'MANUAL_REVIEW_REQUIRED'])
        )
      )
      .returning();

    if (!updatedIntents[0]) {
      await db
        .delete(consumedTrxIds)
        .where(and(eq(consumedTrxIds.merchantId, merchant.id), eq(consumedTrxIds.trxId, row.trxId)))
        .catch(() => {});
      await db
        .update(smsLedger)
        .set({
          status: 'UNCLAIMED',
          matchType: null,
          externalOrderId: null,
          paymentIntentId: null,
          verifiedAt: null,
        })
        .where(eq(smsLedger.id, row.id))
        .catch(() => {});
      throw new ConflictError('Payment intent state changed concurrently during manual match');
    }
  }

  await db
    .update(verificationQueue)
    .set({ status: 'MANUALLY_APPROVED', resolvedAt: now })
    .where(
      and(
        eq(verificationQueue.merchantId, merchant.id),
        eq(verificationQueue.externalOrderId, payload.externalOrderId),
        inArray(verificationQueue.status, ['WAITING_FOR_SMS', 'MANUAL_REVIEW_REQUIRED'])
      )
    );

  await syncVerifiedOrderAndSession(db, {
    merchantId: merchant.id,
    projectId: intent?.projectId ?? null,
    externalOrderId: payload.externalOrderId,
    paymentIntentId: intent?.id ?? null,
    baseAmount: intent?.baseAmount ?? row.amount,
    uniqueAmount: intent?.uniqueAmount ?? row.amount,
    paidAmount: row.amount,
    trxId: row.trxId,
    matchType: 'MANUAL_VERIFIED',
    customerEmail: payload.customerEmail,
    customerPhone: row.senderNumber,
  });

  await incrementWalletVolume(
    db,
    merchant.id,
    row.provider,
    row.amount,
    row.receiverNumber ?? undefined
  );

  const resolvedCustomer = await resolveCustomerEmailForOrder(db, {
    merchantId: merchant.id,
    externalRefId: payload.externalOrderId,
    paymentIntentId: intent?.id ?? null,
    candidates: [payload.customerEmail],
    customerJson: intent?.customerJson,
  });

  const dispatchCtx = await resolveProjectDispatchContext(
    db,
    merchant,
    intent?.projectId,
    intent?.callbackUrl
  );

  const webhookData = {
    paymentIntentId: intent?.id ?? null,
    merchantId: merchant.id,
    projectId: intent?.projectId ?? null,
    externalRefId: payload.externalOrderId,
    externalOrderId: payload.externalOrderId,
    provider: row.provider,
    trxId: row.trxId,
    amount: row.amount,
    paidAmount: row.amount,
    matchType: 'MANUAL_VERIFIED',
    senderNumber: row.senderNumber,
    status: 'MANUAL_VERIFIED',
    callbackUrl: intent?.callbackUrl,
    verifiedAt: now.getTime(),
  };

  safeWaitUntil(
    ctx,
    Promise.allSettled([
      dispatchWebhook(
        db,
        merchant,
        'payment.verified',
        webhookData,
        1,
        undefined,
        dispatchCtx.targetUrlOverride,
        env,
        undefined,
        dispatchCtx.webhookOptions
      ),
      sendPushToMerchantDevices(
        db,
        fcmServerKeyOrEnv,
        merchant,
        'Manual Match Completed',
        `Order #${payload.externalOrderId} manually verified (৳${row.amount} via ${row.provider})`,
        {
          orderId: payload.externalOrderId,
          trxId: row.trxId,
          status: 'MANUAL_VERIFIED',
        }
      ),
      ...(resolvedCustomer.email && env
        ? [
            notifyPaymentVerifiedInvoiceEmail(db, env, {
              merchantId: merchant.id,
              storeName: dispatchCtx.effective.appName,
              externalRefId: payload.externalOrderId,
              paymentIntentId: intent?.id ?? null,
              customerEmail: resolvedCustomer.email,
              customerName: resolvedCustomer.name,
              customerPhone: resolvedCustomer.phone || row.senderNumber,
              baseAmount: intent?.baseAmount ?? row.amount,
              uniqueAmount: intent?.uniqueAmount ?? row.amount,
              paidAmount: row.amount,
              offsetCents: intent
                ? Math.round((intent.uniqueAmount - intent.baseAmount) * 100)
                : 0,
              provider: row.provider,
              trxId: row.trxId,
              senderNumber: row.senderNumber,
              matchType: 'MANUAL_VERIFIED',
              resolutionSource,
              verifiedAt: now,
            }),
          ]
        : []),
    ])
  );

  return claimed[0];
}

/**
 * Lists waiting or escalated verification queue items for the authenticated merchant.
 */
export async function listPendingQueue(db: AppDb, merchantId: string, projectId?: string) {
  return db
    .select()
    .from(verificationQueue)
    .where(
      and(
        eq(verificationQueue.merchantId, merchantId),
        ...(projectId ? [eq(verificationQueue.projectId, projectId)] : []),
        inArray(verificationQueue.status, ['WAITING_FOR_SMS', 'MANUAL_REVIEW_REQUIRED'])
      )
    )
    .orderBy(desc(verificationQueue.createdAt))
    .limit(50);
}
