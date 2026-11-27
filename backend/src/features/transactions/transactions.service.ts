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
import { BadRequestError, ConflictError, NotFoundError } from '../../shared/errors';
import { safeWaitUntil } from '../../shared/middleware';
import type { AppContextEnv, Env } from '../../shared/types';
import { syncVerifiedOrderAndSession } from '../payments/verification.engine';
import { incrementWalletVolume } from '../wallets/wallets.service';
import { dispatchWebhook, sendPushToMerchantDevices } from '../webhooks/webhook.dispatcher';
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

  await db
    .insert(consumedTrxIds)
    .values({
      merchantId: merchant.id,
      trxId: row.trxId,
      provider: row.provider,
      paymentIntentId: intent?.id ?? null,
      externalRefId: payload.externalOrderId,
      resolutionSource: ctx?.get('authType') === 'device' ? 'ORBIT_ANDROID' : 'ORBIT_DASHBOARD',
      consumedAt: now,
    })
    .onConflictDoNothing();

  if (intent) {
    await db
      .update(paymentIntents)
      .set({
        status: 'VERIFIED',
        provider: row.provider,
        trxId: row.trxId,
        paidAmount: row.amount,
        matchType: 'MANUAL_VERIFIED',
        smsLedgerId: row.id,
        smsReconciliationState: 'RECONCILED',
        resolutionSource: ctx?.get('authType') === 'device' ? 'ORBIT_ANDROID' : 'ORBIT_DASHBOARD',
        stateVersion: intent.stateVersion + 1,
        verifiedAt: now,
        resolvedAt: now,
        updatedAt: now,
      })
      .where(eq(paymentIntents.id, intent.id));
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

  await incrementWalletVolume(db, merchant.id, row.provider, row.amount);

  const webhookData = {
    paymentIntentId: intent?.id ?? null,
    merchantId: merchant.id,
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
        intent?.callbackUrl || undefined,
        env
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
    ])
  );

  return claimed[0];
}

/**
 * Lists waiting or escalated verification queue items for the authenticated merchant.
 */
export async function listPendingQueue(db: AppDb, merchantId: string) {
  return db
    .select()
    .from(verificationQueue)
    .where(
      and(
        eq(verificationQueue.merchantId, merchantId),
        inArray(verificationQueue.status, ['WAITING_FOR_SMS', 'MANUAL_REVIEW_REQUIRED'])
      )
    )
    .orderBy(desc(verificationQueue.createdAt))
    .limit(50);
}
