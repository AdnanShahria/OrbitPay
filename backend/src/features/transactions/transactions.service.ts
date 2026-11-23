import { eq, and, desc, sql, like, or, type SQL } from 'drizzle-orm';
import type { AppDb } from '../../db/client';
import {
  smsLedger,
  verificationQueue,
  type MerchantRecord,
  type SmsLedgerRecord,
} from '../../db/schema';
import { NotFoundError, BadRequestError } from '../../shared/errors';
import type { Env } from '../../shared/types';
import { incrementWalletVolume } from '../wallets/wallets.service';
import { dispatchWebhook, sendPushToMerchantDevices } from '../webhooks/webhook.dispatcher';
import { syncVerifiedOrderAndSession } from '../checkout/checkout.service';
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

  // Get total count
  const countRes = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(smsLedger)
    .where(whereClause);
  const total = Number(countRes[0]?.count || 0);

  // Get paginated items
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
 * Allows merchant in dashboard to resolve customer typos by manually linking an UNCLAIMED SMS
 * to an external order ID.
 */
export async function manualMatchTransaction(
  db: AppDb,
  merchant: MerchantRecord,
  payload: ManualMatchInput,
  fcmServerKeyOrEnv?: string | Env
): Promise<SmsLedgerRecord> {
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

  const now = new Date();

  // 1. Update sms_ledger
  await db
    .update(smsLedger)
    .set({
      status: 'MANUAL_VERIFIED',
      matchType: 'MANUAL_VERIFIED',
      externalOrderId: payload.externalOrderId,
      verifiedAt: now,
    })
    .where(eq(smsLedger.id, row.id));

  // 2. Resolve matching verification_queue item if one was waiting
  await db
    .update(verificationQueue)
    .set({ status: 'MATCHED' })
    .where(
      and(
        eq(verificationQueue.merchantId, merchant.id),
        eq(verificationQueue.externalOrderId, payload.externalOrderId),
        eq(verificationQueue.status, 'WAITING_FOR_SMS')
      )
    );

  // 3. Sync checkout_sessions and merchant_orders
  await syncVerifiedOrderAndSession(db, {
    merchantId: merchant.id,
    externalOrderId: payload.externalOrderId,
    baseAmount: row.amount,
    uniqueAmount: row.amount,
    paidAmount: row.amount,
    trxId: row.trxId,
    matchType: 'MANUAL_VERIFIED',
    customerPhone: row.senderNumber,
  });

  // 4. Update wallet volume
  await incrementWalletVolume(db, merchant.id, row.provider, row.amount);

  // 5. Dispatch storefront HMAC webhook
  const webhookData = {
    merchantId: merchant.id,
    externalOrderId: payload.externalOrderId,
    provider: row.provider,
    trxId: row.trxId,
    amount: row.amount,
    paidAmount: row.amount,
    matchType: 'MANUAL_VERIFIED',
    senderNumber: row.senderNumber,
    status: 'MANUAL_VERIFIED',
    verifiedAt: now.getTime(),
  };

  dispatchWebhook(db, merchant, 'payment.verified', webhookData).catch((err) => {
    console.error('[Manual Match Webhook Error]:', err);
  });

  // 6. Notify companion app devices
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
  ).catch((err) => {
    console.warn('[FCM Push Error]:', err);
  });

  const updated = await db.select().from(smsLedger).where(eq(smsLedger.id, row.id)).limit(1);
  return updated[0];
}

/**
 * Lists waiting/pending verification queue items for the authenticated merchant.
 */
export async function listPendingQueue(db: AppDb, merchantId: string) {
  return db
    .select()
    .from(verificationQueue)
    .where(and(eq(verificationQueue.merchantId, merchantId), eq(verificationQueue.status, 'WAITING_FOR_SMS')))
    .orderBy(desc(verificationQueue.createdAt))
    .limit(50);
}
