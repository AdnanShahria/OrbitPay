import { Hono } from 'hono';
import type { AppContextEnv } from '../../shared/types';
import { authMerchantMiddleware, requireOwnerRoleMiddleware } from '../../shared/middleware';
import { createWalletSchema, updateWalletSchema } from './wallets.schema';
import { listWallets, createWallet, updateWallet, deleteWallet } from './wallets.service';

const router = new Hono<AppContextEnv>();

// Apply merchant authentication across all wallet management routes
router.use('*', authMerchantMiddleware);

/**
 * GET /api/v1/wallets
 * Returns all wallets configured for the authenticated merchant.
 */
router.get('/', async (c) => {
  const db = c.get('db');
  const merchantId = c.get('merchantId')!;
  const wallets = await listWallets(db, merchantId);
  return c.json({ success: true, data: wallets });
});

/**
 * POST /api/v1/wallets
 * Registers a new SIM wallet with rotation limits (owner-only).
 */
router.post('/', requireOwnerRoleMiddleware, async (c) => {
  const db = c.get('db');
  const merchantId = c.get('merchantId')!;
  const body = await c.req.json();
  const input = createWalletSchema.parse(body);
  const created = await createWallet(db, merchantId, input);
  return c.json({ success: true, data: created }, 201);
});

/**
 * PATCH /api/v1/wallets/:id
 * Updates an existing SIM wallet's parameters or status (owner-only).
 */
router.patch('/:id', requireOwnerRoleMiddleware, async (c) => {
  const db = c.get('db');
  const merchantId = c.get('merchantId')!;
  const walletId = c.req.param('id');
  const body = await c.req.json();
  const input = updateWalletSchema.parse(body);
  const updated = await updateWallet(db, merchantId, walletId, input);
  return c.json({ success: true, data: updated });
});

/**
 * DELETE /api/v1/wallets/:id
 * Deletes a registered wallet (owner-only).
 */
router.delete('/:id', requireOwnerRoleMiddleware, async (c) => {
  const db = c.get('db');
  const merchantId = c.get('merchantId')!;
  const walletId = c.req.param('id');
  await deleteWallet(db, merchantId, walletId);
  return c.json({ success: true, message: 'Wallet removed successfully' });
});

export default router;
