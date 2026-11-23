import { Hono } from 'hono';
import type { AppContextEnv } from '../../shared/types';
import { authMerchantMiddleware, authMasterAdminMiddleware } from '../../shared/middleware';
import {
  updateMerchantSettingsSchema,
  rotateKeysSchema,
  registerMerchantSchema,
} from './merchants.schema';
import {
  getMerchantProfile,
  updateMerchantSettings,
  rotateKeys,
  registerMerchant,
} from './merchants.service';

const router = new Hono<AppContextEnv>();

/**
 * POST /api/v1/merchants/register
 * Onboards a new merchant store into ORBIT Hub (locked to Master Admin only).
 * Returns initial merchant profile, device pairing key, and webhook secret.
 */
router.post('/register', authMasterAdminMiddleware, async (c) => {
  const db = c.get('db');
  const body = await c.req.json();
  const input = registerMerchantSchema.parse(body);

  const result = await registerMerchant(db, input, c.env.ENCRYPTION_PEPPER || '');
  return c.json({ success: true, data: result }, 201);
});

/**
 * GET /api/v1/merchants/profile
 * Returns authenticated merchant profile and configuration.
 */
router.get('/profile', authMerchantMiddleware, async (c) => {
  const db = c.get('db');
  const merchantId = c.get('merchantId')!;
  const profile = await getMerchantProfile(db, merchantId);
  return c.json({ success: true, data: profile });
});

/**
 * POST /api/v1/merchants/settings
 * Updates merchant configuration (webhook URL, grace period, store name).
 */
router.post('/settings', authMerchantMiddleware, async (c) => {
  const db = c.get('db');
  const merchantId = c.get('merchantId')!;
  const body = await c.req.json();
  const input = updateMerchantSettingsSchema.parse(body);

  const updated = await updateMerchantSettings(db, merchantId, input);
  return c.json({ success: true, data: updated });
});

/**
 * POST /api/v1/merchants/keys/rotate
 * Rotates webhook signing secret and/or companion app device key.
 */
router.post('/keys/rotate', authMerchantMiddleware, async (c) => {
  const db = c.get('db');
  const merchantId = c.get('merchantId')!;
  const body = await c.req.json();
  const input = rotateKeysSchema.parse(body);

  const result = await rotateKeys(db, merchantId, input.target, c.env.ENCRYPTION_PEPPER || '');
  return c.json({ success: true, data: result });
});

export default router;
