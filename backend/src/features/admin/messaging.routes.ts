import { Hono } from 'hono';
import { eq, gte, sql } from 'drizzle-orm';
import { z } from 'zod';
import { merchants, otpCodes } from '../../db/schema';
import { getEmailProviderCapabilities } from '../../router/email';
import {
  getFcmV1Status,
  getSmsProviderCapabilities,
  routeSmsOrPush,
} from '../../router/sms';
import { NotFoundError } from '../../shared/errors';
import { authMasterAdminMiddleware } from '../../shared/middleware';
import type { AppContextEnv } from '../../shared/types';
import { sendPushToMerchantDevicesDetailed } from '../webhooks/webhook.dispatcher';

const router = new Hono<AppContextEnv>();
router.use('*', authMasterAdminMiddleware);

const testSmsSchema = z.object({
  to: z.string().trim().min(6, 'Recipient phone number is required').max(25),
  message: z.string().trim().min(1, 'Message is required').max(1600),
});

const testPushSchema = z.object({
  merchantId: z.string().trim().min(1, 'Merchant ID is required'),
  title: z.string().trim().min(1, 'Push title is required').max(160),
  body: z.string().trim().min(1, 'Push body is required').max(1000),
});

/**
 * GET /api/v1/admin/messaging/status
 * Returns SMS provider capabilities, FCM HTTP v1 status, and 24-hour OTP metrics.
 */
router.get('/status', async (c) => {
  const db = c.get('db');
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const otpStatsRows = await db
    .select({
      sentLast24h: sql<number>`COALESCE(COUNT(*), 0)`,
      verifiedLast24h: sql<number>`COALESCE(SUM(CASE WHEN ${otpCodes.consumedAt} IS NOT NULL THEN 1 ELSE 0 END), 0)`,
    })
    .from(otpCodes)
    .where(gte(otpCodes.createdAt, since));

  const row = otpStatsRows[0];

  return c.json({
    success: true,
    data: {
      sms: getSmsProviderCapabilities(c.env),
      email: getEmailProviderCapabilities(c.env),
      push: {
        selfHostedWsConfigured: Boolean(c.env.PUSH_HUB),
        ...getFcmV1Status(c.env),
        fallbackPollingIntervalSec: 60,
      },
      otp: {
        sentLast24h: Number(row?.sentLast24h || 0),
        verifiedLast24h: Number(row?.verifiedLast24h || 0),
      },
    },
  });
});

/**
 * POST /api/v1/admin/messaging/test-sms
 * Sends a test SMS through the configured SMS router.
 */
router.post('/test-sms', async (c) => {
  const db = c.get('db');
  const body = await c.req.json();
  const input = testSmsSchema.parse(body);

  const result = await routeSmsOrPush(
    c.env,
    {
      to: input.to,
      message: input.message,
    },
    {
      db,
      callerId: 'master_admin',
    }
  );

  return c.json({
    success: true,
    data: {
      dispatched: result.success,
      ...(result.providerUsed ? { provider: result.providerUsed } : {}),
      attempts: result.attempts,
    },
  });
});

/**
 * POST /api/v1/admin/messaging/test-push
 * Dispatches a test FCM HTTP v1 push notification to all active devices for a merchant.
 */
router.post('/test-push', async (c) => {
  const db = c.get('db');
  const body = await c.req.json();
  const input = testPushSchema.parse(body);

  const merchantRes = await db
    .select()
    .from(merchants)
    .where(eq(merchants.id, input.merchantId))
    .limit(1);

  const merchant = merchantRes[0];
  if (!merchant) {
    throw new NotFoundError(`Merchant '${input.merchantId}' not found`);
  }

  const result = await sendPushToMerchantDevicesDetailed(
    db,
    c.env,
    merchant,
    input.title,
    input.body,
    {
      event: 'ADMIN_TEST_PUSH',
      type: 'ADMIN_TEST_PUSH',
      merchantId: merchant.id,
    }
  );

  return c.json({
    success: true,
    data: {
      sentCount: result.totalDelivered,
      wsDelivered: result.wsDelivered,
      fcmDelivered: result.fcmDelivered,
      activeSockets: result.activeSockets,
    },
  });
});

export default router;
