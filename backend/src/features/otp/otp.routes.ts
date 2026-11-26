import { Hono } from 'hono';
import { authMerchantMiddleware } from '../../shared/middleware';
import type { AppContextEnv } from '../../shared/types';
import { sendOtpSchema, verifyOtpSchema } from './otp.schema';
import { sendOtp, verifyOtp } from './otp.service';

const router = new Hono<AppContextEnv>();

// All OTP endpoints require authenticated merchant storefront credentials
router.use('*', authMerchantMiddleware);

/**
 * POST /api/v1/otp/send
 * Generates and dispatches a rate-limited 6-digit OTP via SMS.
 */
router.post('/send', async (c) => {
  const db = c.get('db');
  const merchant = c.get('merchant')!;
  const body = await c.req.json();
  const input = sendOtpSchema.parse(body);

  const result = await sendOtp(db, c.env, merchant, input);
  return c.json({ success: true, data: result });
});

/**
 * POST /api/v1/otp/verify
 * Verifies and atomically consumes a 6-digit OTP code.
 */
router.post('/verify', async (c) => {
  const db = c.get('db');
  const merchant = c.get('merchant')!;
  const body = await c.req.json();
  const input = verifyOtpSchema.parse(body);

  const result = await verifyOtp(db, c.env, merchant, input);
  return c.json({ success: true, data: result });
});

export default router;
