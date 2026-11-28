import { Hono } from 'hono';
import type { AppContextEnv } from '../../shared/types';
import {
  authMerchantMiddleware,
  requireMerchantWideScopeMiddleware,
  requireOwnerRoleMiddleware,
  safeWaitUntil,
} from '../../shared/middleware';
import { emitMerchantRealtimeEvent } from '../realtime/realtime.service';
import { createWalletSchema, syncWalletsSchema, updateWalletSchema } from './wallets.schema';
import {
  getAllActiveRotatedWallets,
  listWallets,
  getWalletsOverview,
  createWallet,
  updateWallet,
  deleteWallet,
  syncMerchantWallets,
  dispatchWalletSyncWebhook,
} from './wallets.service';
import { resolveAuthorizedProject, resolveProjectRotatedWallets } from '../projects/projects.service';

const router = new Hono<AppContextEnv>();

// Apply merchant authentication across all wallet management routes
router.use('*', authMerchantMiddleware);

/**
 * GET /api/v1/wallets
 * Returns all wallets configured for the authenticated merchant with rotation telemetry.
 */
router.get('/', async (c) => {
  const db = c.get('db');
  const merchantId = c.get('merchantId')!;
  const project = await resolveAuthorizedProject(db, merchantId, {
    requestedProjectId: c.req.query('projectId'),
    authProject: c.get('project'),
    projectAuthScoped: c.get('projectAuthScoped'),
    requireActive: false,
  });
  if (project && project.walletSelectionMode === 'SPECIFIC') {
    const scoped = await resolveProjectRotatedWallets(db, merchantId, project, undefined, c.env);
    return c.json({ success: true, data: scoped });
  }
  const wallets = await listWallets(db, merchantId);
  return c.json({ success: true, data: wallets });
});

/**
 * GET /api/v1/wallets/overview
 * Returns enriched wallets, connected Android companion devices, and rotation health summary.
 */
router.get('/overview', async (c) => {
  const db = c.get('db');
  const merchantId = c.get('merchantId')!;
  const project = await resolveAuthorizedProject(db, merchantId, {
    requestedProjectId: c.req.query('projectId'),
    authProject: c.get('project'),
    projectAuthScoped: c.get('projectAuthScoped'),
    requireActive: false,
  });
  const overview = await getWalletsOverview(db, merchantId, c.env);
  if (project && project.walletSelectionMode === 'SPECIFIC') {
    const allowed = await resolveProjectRotatedWallets(db, merchantId, project, undefined, c.env);
    const allowedSet = new Set(allowed.map((w) => w.id));
    const filtered = overview.wallets.filter((w) => allowedSet.has(w.id));
    return c.json({
      success: true,
      data: {
        ...overview,
        wallets: filtered,
        summary: {
          ...overview.summary,
          totalWallets: filtered.length,
          activeWallets: filtered.filter((w) => w.isActive && !w.isPlaceholder).length,
        },
      },
    });
  }
  return c.json({ success: true, data: overview });
});

/**
 * POST /api/v1/wallets
 * Registers a new SIM wallet with 250k safe / 300k hard rotation limits (owner-only).
 */
router.post('/', requireOwnerRoleMiddleware, requireMerchantWideScopeMiddleware, async (c) => {
  const db = c.get('db');
  const merchant = c.get('merchant')!;
  const body = await c.req.json();
  const input = createWalletSchema.parse(body);
  const created = await createWallet(db, merchant.id, input);
  safeWaitUntil(c, dispatchWalletSyncWebhook(db, merchant, 'wallet.synced', c.env));
  emitMerchantRealtimeEvent(
    c.env,
    'WALLET_SYNCED',
    { merchantId: merchant.id, action: 'created' },
    merchant.id,
    c
  );
  return c.json({ success: true, data: created }, 201);
});

/**
 * POST /api/v1/wallets/sync
 * Bulk-syncs storefront MFS numbers and optionally clears seeded placeholder wallets (owner-only).
 */
router.post('/sync', requireOwnerRoleMiddleware, requireMerchantWideScopeMiddleware, async (c) => {
  const db = c.get('db');
  const merchant = c.get('merchant')!;
  const body = await c.req.json();
  const input = syncWalletsSchema.parse(body);
  const data = await syncMerchantWallets(db, merchant.id, input, c.env, merchant);
  if (!data.ignored) {
    emitMerchantRealtimeEvent(
      c.env,
      'WALLET_SYNCED',
      { merchantId: merchant.id, action: 'synced' },
      merchant.id,
      c
    );
  }
  return c.json({ success: true, data }, 200);
});

/**
 * PATCH /api/v1/wallets/:id
 * Updates an existing SIM wallet's parameters or status (owner-only).
 */
router.patch('/:id', requireOwnerRoleMiddleware, requireMerchantWideScopeMiddleware, async (c) => {
  const db = c.get('db');
  const merchant = c.get('merchant')!;
  const walletId = c.req.param('id');
  const body = await c.req.json();
  const input = updateWalletSchema.parse(body);
  const updated = await updateWallet(db, merchant.id, walletId, input);
  safeWaitUntil(c, dispatchWalletSyncWebhook(db, merchant, 'wallet.synced', c.env));
  emitMerchantRealtimeEvent(
    c.env,
    'WALLET_SYNCED',
    { merchantId: merchant.id, action: 'updated' },
    merchant.id,
    c
  );
  return c.json({ success: true, data: updated });
});

/**
 * DELETE /api/v1/wallets/:id
 * Deletes a registered wallet (owner-only).
 */
router.delete('/:id', requireOwnerRoleMiddleware, requireMerchantWideScopeMiddleware, async (c) => {
  const db = c.get('db');
  const merchant = c.get('merchant')!;
  const walletId = c.req.param('id');
  await deleteWallet(db, merchant.id, walletId);
  safeWaitUntil(c, dispatchWalletSyncWebhook(db, merchant, 'wallet.synced', c.env));
  emitMerchantRealtimeEvent(
    c.env,
    'WALLET_SYNCED',
    { merchantId: merchant.id, action: 'deleted' },
    merchant.id,
    c
  );
  return c.json({ success: true, message: 'Wallet removed successfully' });
});

export default router;
