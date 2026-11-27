import { and, eq, inArray, isNotNull, lte, or } from 'drizzle-orm';
import app from './index';
import { getDb, type AppDb } from './db/client';
import {
  authSessions,
  checkoutSessions,
  merchantWallets,
  merchants,
  otpCodes,
  paymentIntents,
  routerKvStore,
  routerProviderLogs,
  verificationQueue,
} from './db/schema';
import { parseActionsList, parseDisplayMetadata } from './features/payments/verification.engine';
import {
  dispatchWebhook,
  processWebhookRetries,
  sendDynamicPushToMerchantDevices,
  sendTelegramOfficeAlert,
} from './features/webhooks/webhook.dispatcher';
import type { Env } from './shared/types';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Transitions expired WAITING_FOR_SMS payment intents to MANUAL_REVIEW_REQUIRED (GRACE_PERIOD_EXCEEDED)
 * and dispatches `payment.escalated_manual` webhooks & alerts. Never expires submitted proofs.
 */
async function escalateExpiredGraceIntents(db: AppDb, env: Env, now: Date): Promise<void> {
  const expiredGraceIntents = await db
    .select()
    .from(paymentIntents)
    .where(and(eq(paymentIntents.status, 'WAITING_FOR_SMS'), lte(paymentIntents.graceExpiresAt, now)))
    .limit(50);

  for (const intent of expiredGraceIntents) {
    const updatedRows = await db
      .update(paymentIntents)
      .set({
        status: 'MANUAL_REVIEW_REQUIRED',
        escalationReason: 'GRACE_PERIOD_EXCEEDED',
        stateVersion: intent.stateVersion + 1,
        updatedAt: now,
      })
      .where(
        and(
          eq(paymentIntents.id, intent.id),
          eq(paymentIntents.status, 'WAITING_FOR_SMS'),
          eq(paymentIntents.stateVersion, intent.stateVersion)
        )
      )
      .returning();

    const updated = updatedRows[0];
    if (!updated) continue;

    await Promise.all([
      db
        .update(verificationQueue)
        .set({
          status: 'MANUAL_REVIEW_REQUIRED',
          escalationReason: 'GRACE_PERIOD_EXCEEDED',
          escalatedAt: now,
        })
        .where(
          and(
            eq(verificationQueue.merchantId, intent.merchantId),
            or(
              eq(verificationQueue.paymentIntentId, intent.id),
              eq(verificationQueue.externalOrderId, intent.externalRefId)
            ),
            eq(verificationQueue.status, 'WAITING_FOR_SMS')
          )
        ),
      db
        .update(checkoutSessions)
        .set({ status: 'ESCALATED' })
        .where(
          and(
            eq(checkoutSessions.merchantId, intent.merchantId),
            or(
              eq(checkoutSessions.paymentIntentId, intent.id),
              eq(checkoutSessions.externalOrderId, intent.externalRefId)
            ),
            inArray(checkoutSessions.status, ['OPEN', 'SUBMITTED'])
          )
        ),
    ]);

    const merchantRes = await db
      .select()
      .from(merchants)
      .where(eq(merchants.id, intent.merchantId))
      .limit(1);
    const merchant = merchantRes[0];
    if (!merchant || !merchant.isActive) continue;

    const display = parseDisplayMetadata(
      updated.displayJson,
      merchant.storeName,
      updated.externalRefId
    );
    const actions = parseActionsList(updated.actionsJson);

    await Promise.allSettled([
      dispatchWebhook(
        db,
        merchant,
        'payment.escalated_manual',
        {
          paymentIntentId: updated.id,
          merchantId: merchant.id,
          externalRefId: updated.externalRefId,
          externalOrderId: updated.externalRefId,
          vertical: updated.vertical,
          provider: updated.provider,
          trxId: updated.trxId,
          senderNumber: updated.senderNumber,
          baseAmount: updated.baseAmount,
          uniqueAmount: updated.uniqueAmount,
          paidAmount: updated.paidAmount,
          receiptUrl: updated.receiptUrl,
          escalationReason: 'GRACE_PERIOD_EXCEEDED',
          stateVersion: updated.stateVersion,
          status: 'MANUAL_REVIEW_REQUIRED',
          callbackUrl: updated.callbackUrl,
          escalatedAt: now.getTime(),
        },
        1,
        undefined,
        updated.callbackUrl || undefined,
        env
      ),
      sendDynamicPushToMerchantDevices(db, env, merchant, {
        event: 'payment.escalated_manual',
        paymentIntentId: updated.id,
        externalRefId: updated.externalRefId,
        appName: display.appName || merchant.storeName,
        appDomain: display.appDomain,
        category: display.category || updated.vertical,
        referenceLabel: display.referenceLabel,
        title: 'Grace Period Exceeded — Manual Review',
        subtitle: display.subtitle || `TrxID ${updated.trxId || 'N/A'}`,
        amountFormatted: `৳${updated.paidAmount ?? updated.uniqueAmount}`,
        provider: updated.provider ?? undefined,
        paymentStatus: 'MANUAL_REVIEW_REQUIRED',
        adminDeepLink: display.adminDeepLink,
        actions,
      }),
      sendTelegramOfficeAlert(
        merchant,
        `⏱️ Grace Period Exceeded [${display.appName || merchant.storeName}]\nRef: ${updated.externalRefId}\nAmount: ৳${updated.paidAmount ?? updated.uniqueAmount}\nTrxID: ${updated.trxId || 'N/A'}\nRouted to Manual Review.`
      ),
    ]);
  }

  // Fallback for any legacy verificationQueue rows without a linked paymentIntentId
  await db
    .update(verificationQueue)
    .set({
      status: 'MANUAL_REVIEW_REQUIRED',
      escalationReason: 'GRACE_PERIOD_EXCEEDED',
      escalatedAt: now,
    })
    .where(
      and(
        eq(verificationQueue.status, 'WAITING_FOR_SMS'),
        lte(verificationQueue.expiresAt, now)
      )
    );
}

/**
 * Expires ONLY unsubmitted OPEN intents & sessions (`payment.expired`).
 */
async function expireUnsubmittedOpenSessions(db: AppDb, env: Env, now: Date): Promise<void> {
  const expiredOpenIntents = await db
    .select()
    .from(paymentIntents)
    .where(and(eq(paymentIntents.status, 'OPEN'), lte(paymentIntents.expiresAt, now)))
    .limit(50);

  for (const intent of expiredOpenIntents) {
    const updatedRows = await db
      .update(paymentIntents)
      .set({
        status: 'EXPIRED',
        stateVersion: intent.stateVersion + 1,
        updatedAt: now,
      })
      .where(
        and(
          eq(paymentIntents.id, intent.id),
          eq(paymentIntents.status, 'OPEN'),
          eq(paymentIntents.stateVersion, intent.stateVersion)
        )
      )
      .returning();

    if (!updatedRows[0]) continue;

    const merchantRes = await db
      .select()
      .from(merchants)
      .where(eq(merchants.id, intent.merchantId))
      .limit(1);
    const merchant = merchantRes[0];
    if (!merchant || !merchant.isActive) continue;

    await dispatchWebhook(
      db,
      merchant,
      'payment.expired',
      {
        paymentIntentId: intent.id,
        merchantId: merchant.id,
        externalRefId: intent.externalRefId,
        externalOrderId: intent.externalRefId,
        vertical: intent.vertical,
        baseAmount: intent.baseAmount,
        uniqueAmount: intent.uniqueAmount,
        stateVersion: updatedRows[0].stateVersion,
        status: 'EXPIRED',
        callbackUrl: intent.callbackUrl,
        expiredAt: now.getTime(),
      },
      1,
      undefined,
      intent.callbackUrl || undefined,
      env
    ).catch((err) => {
      console.warn('[Cron payment.expired Webhook Error]:', err);
    });
  }

  // Only expire unsubmitted OPEN checkout sessions; SUBMITTED sessions remain until verified/escalated/rejected
  await db
    .update(checkoutSessions)
    .set({ status: 'EXPIRED' })
    .where(and(eq(checkoutSessions.status, 'OPEN'), lte(checkoutSessions.expiresAt, now)));
}

async function runMinuteJobs(db: AppDb, env: Env, now: Date): Promise<void> {
  await Promise.allSettled([
    processWebhookRetries(db, env),
    escalateExpiredGraceIntents(db, env, now),
    expireUnsubmittedOpenSessions(db, env, now),
  ]);
}

async function runHourlyCleanup(db: AppDb, now: Date): Promise<void> {
  const otpCutoff = new Date(now.getTime() - ONE_DAY_MS);
  const sessionCutoff = new Date(now.getTime() - SEVEN_DAYS_MS);
  const logCutoff = new Date(now.getTime() - THIRTY_DAYS_MS);

  await Promise.allSettled([
    db
      .delete(routerKvStore)
      .where(and(isNotNull(routerKvStore.expiresAt), lte(routerKvStore.expiresAt, now))),
    db.delete(otpCodes).where(lte(otpCodes.expiresAt, otpCutoff)),
    db.delete(authSessions).where(lte(authSessions.expiresAt, sessionCutoff)),
    db.delete(routerProviderLogs).where(lte(routerProviderLogs.createdAt, logCutoff)),
  ]);
}

async function runMonthlyWalletReset(db: AppDb): Promise<void> {
  await db.update(merchantWallets).set({ currentMonthVolume: 0 });
}

/**
 * Unified Cloudflare Worker Entrypoint (Frontend Static Assets + Hono API + Cron)
 */
const worker: ExportedHandler<Env> = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname.startsWith('/api/') || url.pathname === '/health') {
      return app.fetch(request, env, ctx);
    }

    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    return app.fetch(request, env, ctx);
  },

  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    if (!env.DB) return;

    const db = getDb(env.DB);
    const now = new Date();

    switch (controller.cron) {
      case '0 * * * *':
        ctx.waitUntil(runHourlyCleanup(db, now));
        break;
      case '0 0 1 * *':
        ctx.waitUntil(runMonthlyWalletReset(db));
        break;
      case '* * * * *':
      default:
        ctx.waitUntil(runMinuteJobs(db, env, now));
        break;
    }
  },
};

export { MerchantPushHub } from './durable/merchant-push-hub';
export default worker;
