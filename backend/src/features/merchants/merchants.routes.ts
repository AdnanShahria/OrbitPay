import { Hono } from 'hono';
import type { AppContextEnv } from '../../shared/types';
import {
  authMasterAdminMiddleware,
  authMerchantMiddleware,
  requireOwnerRoleMiddleware,
} from '../../shared/middleware';
import {
  listMerchantWebhooksQuerySchema,
  registerMerchantSchema,
  rotateKeysSchema,
  updateMerchantSettingsSchema,
  verifySetupUnlockOtpSchema,
} from './merchants.schema';
import {
  getMerchantProfile,
  listMerchantWebhooks,
  registerMerchant,
  replayMerchantWebhook,
  rotateKeys,
  sendMerchantTestWebhook,
  updateMerchantSettings,
} from './merchants.service';
import {
  assertSetupUnlockedForJwt,
  maskEmailAddress,
  requestSetupUnlockOtp,
  SETUP_LOCK_ADMIN_EMAIL,
  SETUP_UNLOCK_HEADER,
  validateSetupUnlockToken,
  verifySetupUnlockOtp,
} from './setup-lock.service';

const router = new Hono<AppContextEnv>();

/**
 * POST /api/v1/merchants/register
 * Onboards a new merchant store into ORBIT Hub (locked to Master Admin only).
 */
router.post('/register', authMasterAdminMiddleware, async (c) => {
  const db = c.get('db');
  const body = await c.req.json();
  const input = registerMerchantSchema.parse(body);

  const result = await registerMerchant(db, input, c.env.ENCRYPTION_PEPPER || '', c.env);
  return c.json({ success: true, data: result }, 201);
});

/**
 * GET /api/v1/merchants/profile
 * Returns authenticated merchant profile and configuration (with masked webhookSecret).
 */
router.get('/profile', authMerchantMiddleware, async (c) => {
  const db = c.get('db');
  const merchantId = c.get('merchantId')!;
  const profile = await getMerchantProfile(db, merchantId);
  return c.json({ success: true, data: profile });
});

/**
 * GET /api/v1/merchants/setup-lock/status
 * Checks whether setup/developer editing is currently unlocked via X-Setup-Unlock-Token.
 */
router.get('/setup-lock/status', authMerchantMiddleware, async (c) => {
  const merchantId = c.get('merchantId')!;
  const claims = await validateSetupUnlockToken(
    c.env,
    c.req.header(SETUP_UNLOCK_HEADER),
    merchantId,
    c.get('sessionId')
  );
  return c.json({
    success: true,
    data: {
      locked: !claims,
      emailHint: maskEmailAddress(SETUP_LOCK_ADMIN_EMAIL),
      expiresAt: claims ? new Date(claims.exp * 1000).toISOString() : null,
    },
  });
});

/**
 * POST /api/v1/merchants/setup-lock/request-otp
 * Sends a 6-digit setup unlock OTP strictly to the authorized administrator email.
 */
router.post('/setup-lock/request-otp', authMerchantMiddleware, requireOwnerRoleMiddleware, async (c) => {
  const db = c.get('db');
  const merchant = c.get('merchant')!;
  const result = await requestSetupUnlockOtp(db, c.env, merchant);
  return c.json({ success: true, data: result });
});

/**
 * POST /api/v1/merchants/setup-lock/verify-otp
 * Verifies the 6-digit setup unlock OTP and returns a 30-minute unlock token.
 */
router.post('/setup-lock/verify-otp', authMerchantMiddleware, requireOwnerRoleMiddleware, async (c) => {
  const db = c.get('db');
  const merchant = c.get('merchant')!;
  const body = await c.req.json();
  const input = verifySetupUnlockOtpSchema.parse(body);
  const result = await verifySetupUnlockOtp(
    db,
    c.env,
    merchant,
    c.get('sessionId'),
    input.code,
    input.otpId
  );
  return c.json({ success: true, data: result });
});

/**
 * POST /api/v1/merchants/settings
 * Updates merchant configuration (owner role or server API key required).
 */
router.post('/settings', authMerchantMiddleware, requireOwnerRoleMiddleware, async (c) => {
  await assertSetupUnlockedForJwt(c);
  const db = c.get('db');
  const merchantId = c.get('merchantId')!;
  const body = await c.req.json();
  const input = updateMerchantSettingsSchema.parse(body);

  const updated = await updateMerchantSettings(db, merchantId, input, c.env);
  return c.json({ success: true, data: updated });
});

/**
 * POST /api/v1/merchants/keys/rotate
 * Rotates webhook signing secret, API key, and/or companion app device key.
 */
router.post('/keys/rotate', authMerchantMiddleware, requireOwnerRoleMiddleware, async (c) => {
  await assertSetupUnlockedForJwt(c);
  const db = c.get('db');
  const merchantId = c.get('merchantId')!;
  const body = await c.req.json();
  const input = rotateKeysSchema.parse(body);

  const result = await rotateKeys(db, merchantId, input.target, c.env.ENCRYPTION_PEPPER || '');
  return c.json({ success: true, data: result });
});

/**
 * POST /api/v1/merchants/webhook/test
 * Dispatches a signed `webhook.test` event to the merchant's configured webhookUrl.
 */
router.post('/webhook/test', authMerchantMiddleware, requireOwnerRoleMiddleware, async (c) => {
  await assertSetupUnlockedForJwt(c);
  const db = c.get('db');
  const merchant = c.get('merchant')!;
  const result = await sendMerchantTestWebhook(db, c.env, merchant);
  return c.json({ success: true, data: result });
});

/**
 * GET /api/v1/merchants/webhooks
 * Lists recent webhook delivery attempts for the authenticated merchant.
 */
router.get('/webhooks', authMerchantMiddleware, async (c) => {
  const db = c.get('db');
  const merchantId = c.get('merchantId')!;
  const query = listMerchantWebhooksQuerySchema.parse(c.req.query());
  const data = await listMerchantWebhooks(db, merchantId, query);
  return c.json({ success: true, data });
});

/**
 * POST /api/v1/merchants/webhooks/:id/replay
 * Replays an immutable webhook delivery record.
 */
router.post('/webhooks/:id/replay', authMerchantMiddleware, requireOwnerRoleMiddleware, async (c) => {
  await assertSetupUnlockedForJwt(c);
  const db = c.get('db');
  const merchant = c.get('merchant')!;
  const id = c.req.param('id');
  const result = await replayMerchantWebhook(db, c.env, merchant, id);
  return c.json({ success: true, data: result });
});

export default router;
