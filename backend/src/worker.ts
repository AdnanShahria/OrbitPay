import { and, eq, inArray, lte } from 'drizzle-orm';
import app from './index';
import { getDb } from './db/client';
import { checkoutSessions, verificationQueue } from './db/schema';
import { processWebhookRetries } from './features/webhooks/webhook.dispatcher';
import type { Env } from './shared/types';

/**
 * Unified Cloudflare Worker Entrypoint (Single Project: Frontend Static Assets + Hono API + Cron)
 *
 * - `/api/*` and `/health` -> Hono edge backend (`backend/src/index.ts`)
 * - All other routes       -> Static React 19 SPA assets (`frontend/dist` via `env.ASSETS`)
 * - `scheduled()`          -> 1-minute Cron for webhook retries & expired queue cleanup
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

  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    if (!env.DB) return;

    const db = getDb(env.DB);
    const now = new Date();

    ctx.waitUntil(
      Promise.allSettled([
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
      ])
    );
  },
};

export default worker;
