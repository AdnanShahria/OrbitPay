import { and, eq, inArray, isNotNull, lte } from 'drizzle-orm';
import app from './index';
import { getDb, type AppDb } from './db/client';
import {
  authSessions,
  checkoutSessions,
  merchantWallets,
  otpCodes,
  routerKvStore,
  routerProviderLogs,
  verificationQueue,
} from './db/schema';
import { processWebhookRetries } from './features/webhooks/webhook.dispatcher';
import type { Env } from './shared/types';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

async function runMinuteJobs(db: AppDb, now: Date): Promise<void> {
  await Promise.allSettled([
    processWebhookRetries(db),
    db
      .update(verificationQueue)
      .set({ status: 'EXPIRED' })
      .where(
        and(
          eq(verificationQueue.status, 'WAITING_FOR_SMS'),
          lte(verificationQueue.expiresAt, now)
        )
      ),
    db
      .update(checkoutSessions)
      .set({ status: 'EXPIRED' })
      .where(
        and(
          inArray(checkoutSessions.status, ['OPEN', 'SUBMITTED']),
          lte(checkoutSessions.expiresAt, now)
        )
      ),
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
 * Unified Cloudflare Worker Entrypoint (Single Project: Frontend Static Assets + Hono API + Cron)
 *
 * - `/api/*` and `/health` -> Hono edge backend (`backend/src/index.ts`)
 * - All other routes       -> Static React 19 SPA assets (`frontend/dist` via `env.ASSETS`)
 * - `scheduled()`          -> Cloudflare Cron Triggers:
 *   - `* * * * *`          -> Webhook retries & expired queue/checkout cleanup
 *   - `0 * * * *`          -> Hourly cleanup of expired KV, old auth sessions & router logs
 *   - `0 0 1 * *`          -> Monthly reset of merchant wallet volume quotas
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
        ctx.waitUntil(runMinuteJobs(db, now));
        break;
    }
  },
};

export { MerchantPushHub } from './durable/merchant-push-hub';
export default worker;
