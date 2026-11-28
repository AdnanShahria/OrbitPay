import { Hono } from 'hono';
import type { AppDb } from '../../db/client';
import type { AppContextEnv } from '../../shared/types';
import {
  authenticateAdminJwt,
  authMasterAdminMiddleware,
  requireSuperAdminMiddleware,
  resolveMasterAdminKey,
  safeWaitUntil,
} from '../../shared/middleware';
import { NotFoundError } from '../../shared/errors';
import { emitMerchantRealtimeEvent } from '../realtime/realtime.service';
import { createWalletSchema, updateWalletSchema } from '../wallets/wallets.schema';
import {
  createWallet,
  updateWallet,
  deleteWallet,
  dispatchWalletSyncWebhook,
} from '../wallets/wallets.service';
import { createPaymentLinkSchema } from '../payment-links/payment-links.schema';
import { createPaymentLink } from '../payment-links/payment-links.service';
import { resolvePaymentSchema } from '../payments/payments.schema';
import { resolvePaymentIntent, resolvePublicOrigin } from '../payments/payments.service';
import { checkCoreTablesHealth, ensureRuntimeSchema } from '../../db/bootstrap';
import {
  verifyAdminKeySchema,
  adminLoginSchema,
  bootstrapAdminSchema,
  createAdminUserSchema,
  updateAdminUserSchema,
  logoutAllAdminSchema,
  createProjectSchema,
  updateProjectSchema,
  createProjectUserSchema,
  resetUserPasswordSchema,
} from './admin.schema';
import {
  bootstrapFirstAdmin,
  createAdminUser,
  extractAdminActor,
  extractAdminRequestMeta,
  getAdminAuthContext,
  listAdminSecurityState,
  loginAdminWithMasterKey,
  loginAdminWithPassword,
  logoutAdminSession,
  logoutAllAdminSessions,
  recordAdminAudit,
  revokeSpecificAdminSession,
  updateAdminUser,
} from './admin-auth.service';
import {
  adminUpdateSubProjectSchema,
  createSubProjectSchema,
  rotateProjectKeysSchema,
} from '../projects/projects.schema';
import {
  createMerchantProject,
  deleteMerchantProject,
  listMerchantProjects,
  resolveAuthorizedProject,
  rotateMerchantProjectKeys,
  updateMerchantProject,
} from '../projects/projects.service';
import {
  getAdminOverview,
  getAdminProjects,
  createAdminProject,
  updateAdminProject,
  inspectAdminProject,
  deleteAdminProject,
  getAdminWebhooks,
  getAdminQueue,
  getProjectUsersAndSessions,
  createProjectUser,
  resetProjectUserPassword,
  revokeAdminSession,
} from './admin.service';
import { processWebhookRetries } from '../webhooks/webhook.dispatcher';
import {
  getPlatformSettings,
  updatePlatformSettings,
  updatePlatformSettingsSchema,
} from './platform-settings.service';
import { merchants } from '../../db/schema';
import { eq } from 'drizzle-orm';

const router = new Hono<AppContextEnv>();
const requireAdminAuth = authMasterAdminMiddleware;

/**
 * POST /api/v1/admin/auth/login
 * Authenticates a Hub Admin via email + password OR Master Admin Key, issuing a 24h Admin JWT.
 */
router.post('/auth/login', async (c) => {
  const db = c.get('db');
  const body = await c.req.json().catch(() => ({}));
  const input = adminLoginSchema.parse(body);
  const meta = extractAdminRequestMeta(c);

  const result = input.adminKey
    ? await loginAdminWithMasterKey(db, c.env, input.adminKey, meta)
    : await loginAdminWithPassword(db, c.env, input.email!, input.password!, meta);

  return c.json({
    success: true,
    data: result,
  });
});

/**
 * POST /api/v1/admin/auth/verify
 * Backward-compatible Admin verification: accepts Bearer Admin JWT or `{ adminKey }`.
 */
router.post('/auth/verify', async (c) => {
  const db = c.get('db');
  const authHeader = c.req.header('authorization');
  const bearerToken =
    authHeader && authHeader.toLowerCase().startsWith('bearer ')
      ? authHeader.substring(7).trim()
      : undefined;

  if (bearerToken && bearerToken.split('.').length === 3) {
    await authenticateAdminJwt(c, db, bearerToken);
    const context = await getAdminAuthContext(db, c);
    return c.json({
      success: true,
      data: {
        role: 'MASTER_ADMIN',
        authenticatedAt: new Date().toISOString(),
        expiresIn: 86400,
        ...context,
      },
    });
  }

  const body = await c.req.json().catch(() => ({}));
  const input = verifyAdminKeySchema.parse(body);
  const result = await loginAdminWithMasterKey(
    db,
    c.env,
    input.adminKey,
    extractAdminRequestMeta(c)
  );

  return c.json({
    success: true,
    data: {
      role: 'MASTER_ADMIN',
      authenticatedAt: new Date().toISOString(),
      expiresIn: 86400,
      ...result,
    },
  });
});

/**
 * GET /api/v1/admin/auth/me
 * Returns the authenticated admin identity, current session, and bootstrap status.
 */
router.get('/auth/me', requireAdminAuth, async (c) => {
  const db = c.get('db');
  const data = await getAdminAuthContext(db, c);
  return c.json({ success: true, data });
});

/**
 * POST /api/v1/admin/auth/bootstrap
 * Bootstraps the first SUPER_ADMIN account when no admin_users exist yet.
 */
router.post('/auth/bootstrap', requireAdminAuth, requireSuperAdminMiddleware, async (c) => {
  const db = c.get('db');
  const body = await c.req.json().catch(() => ({}));
  const input = bootstrapAdminSchema.parse(body);

  const created = await bootstrapFirstAdmin(db, c.env, input, {
    ...extractAdminRequestMeta(c),
    actor: extractAdminActor(c),
  });

  return c.json({ success: true, data: created }, 201);
});

/**
 * POST /api/v1/admin/auth/logout
 * Revokes the caller's current Admin JWT session.
 */
router.post('/auth/logout', requireAdminAuth, async (c) => {
  const db = c.get('db');
  const result = await logoutAdminSession(db, c.get('adminSessionId'), extractAdminActor(c));
  c.header('Clear-Site-Data', '"cache"');
  return c.json({ success: true, data: result });
});

/**
 * POST /api/v1/admin/auth/logout-all
 * Revokes all active Admin sessions across all devices (optionally keeping current).
 */
router.post('/auth/logout-all', requireAdminAuth, requireSuperAdminMiddleware, async (c) => {
  const db = c.get('db');
  const body = await c.req.json().catch(() => ({}));
  const input = logoutAllAdminSchema.parse(body);
  const exceptSessionId = input.includeCurrent ? undefined : c.get('adminSessionId');

  const result = await logoutAllAdminSessions(db, exceptSessionId, extractAdminActor(c));
  if (input.includeCurrent) {
    c.header('Clear-Site-Data', '"cache"');
  }
  return c.json({ success: true, data: result });
});

/**
 * GET /api/v1/admin/auth/security
 * Lists recent admin sessions, admin accounts, and audit logs.
 */
router.get('/auth/security', requireAdminAuth, async (c) => {
  const db = c.get('db');
  const data = await listAdminSecurityState(db);
  return c.json({ success: true, data });
});

/**
 * DELETE /api/v1/admin/auth/sessions/:sessionId
 * Revokes a specific Admin JWT session immediately.
 */
router.delete('/auth/sessions/:sessionId', requireAdminAuth, async (c) => {
  const db = c.get('db');
  const sessionId = c.req.param('sessionId');
  const result = await revokeSpecificAdminSession(db, sessionId, extractAdminActor(c));
  return c.json({ success: true, data: result });
});

/**
 * POST /api/v1/admin/auth/users
 * Creates a new Hub Admin account (SUPER_ADMIN only).
 */
router.post('/auth/users', requireAdminAuth, requireSuperAdminMiddleware, async (c) => {
  const db = c.get('db');
  const body = await c.req.json().catch(() => ({}));
  const input = createAdminUserSchema.parse(body);

  const created = await createAdminUser(db, input, extractAdminActor(c));
  return c.json({ success: true, data: created }, 201);
});

/**
 * PATCH /api/v1/admin/auth/users/:id
 * Updates an admin account, toggles active state, or resets password (SUPER_ADMIN only).
 */
router.patch('/auth/users/:id', requireAdminAuth, requireSuperAdminMiddleware, async (c) => {
  const db = c.get('db');
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));
  const input = updateAdminUserSchema.parse(body);

  const updated = await updateAdminUser(db, id, input, extractAdminActor(c));
  return c.json({ success: true, data: updated });
});

/**
 * GET /api/v1/admin/system/health
 * Reports environment bindings, D1 table readiness, and simulator status.
 */
router.get('/system/health', requireAdminAuth, async (c) => {
  const db = c.get('db');
  const tables = await checkCoreTablesHealth(db);

  return c.json({
    success: true,
    data: {
      environment: c.env.ENVIRONMENT || 'production',
      simulatorEnabled: c.env.ENVIRONMENT !== 'production',
      d1Connected: true,
      r2Configured: Boolean(c.env.R2_BUCKET),
      pushHubConfigured: Boolean(c.env.PUSH_HUB),
      fcmConfigured: Boolean(c.env.FCM_SERVICE_ACCOUNT_JSON),
      masterKeyConfigured: Boolean(resolveMasterAdminKey(c.env)),
      tables,
    },
  });
});

/**
 * POST /api/v1/admin/system/ensure-schema
 * Idempotently runs runtime D1 schema bootstrap and returns updated table health.
 */
router.post('/system/ensure-schema', requireAdminAuth, async (c) => {
  const db = c.get('db');
  await ensureRuntimeSchema(db, { force: true });
  const tables = await checkCoreTablesHealth(db);

  return c.json({
    success: true,
    data: {
      ensured: true,
      tables,
    },
  });
});

/**
 * GET /api/v1/admin/settings
 * Returns platform-wide public branding, WhatsApp CTA, and orbitsaas.cloud marketing settings.
 */
router.get('/settings', requireAdminAuth, async (c) => {
  const db = c.get('db');
  const settings = await getPlatformSettings(db);
  return c.json({ success: true, data: settings });
});

/**
 * PATCH /api/v1/admin/settings
 * Updates platform-wide WhatsApp CTA number and orbitsaas.cloud marketing settings.
 */
router.patch('/settings', requireAdminAuth, async (c) => {
  const db = c.get('db');
  const body = await c.req.json().catch(() => ({}));
  const input = updatePlatformSettingsSchema.parse(body);
  const updated = await updatePlatformSettings(db, input, extractAdminActor(c));
  return c.json({ success: true, data: updated });
});

/**
 * GET /api/v1/admin/overview
 * Cross-project telemetry and global health metrics.
 */
router.get('/overview', requireAdminAuth, async (c) => {
  const db = c.get('db');
  const stats = await getAdminOverview(db);
  return c.json({ success: true, data: stats });
});

/**
 * GET /api/v1/admin/projects
 * List all connected client projects / storefronts.
 */
router.get('/projects', requireAdminAuth, async (c) => {
  const db = c.get('db');
  const projects = await getAdminProjects(db, c.env);
  return c.json({ success: true, data: projects });
});

/**
 * POST /api/v1/admin/projects
 * Onboards a new client merchant store.
 */
router.post('/projects', requireAdminAuth, async (c) => {
  const db = c.get('db');
  const body = await c.req.json();
  const input = createProjectSchema.parse(body);

  const result = await createAdminProject(
    db,
    input,
    c.env.ENCRYPTION_PEPPER || '',
    resolvePublicOrigin(c.req.url, c.env.PRODUCTION_DOMAIN)
  );
  return c.json({ success: true, data: result }, 201);
});

/**
 * PATCH /api/v1/admin/projects/:id
 * Updates project configuration or toggles active state.
 */
router.patch('/projects/:id', requireAdminAuth, async (c) => {
  const db = c.get('db');
  const id = c.req.param('id');
  const body = await c.req.json();
  const input = updateProjectSchema.parse(body);

  const updated = await updateAdminProject(db, id, input, c.env);
  return c.json({ success: true, data: updated });
});

/**
 * GET /api/v1/admin/projects/:id/inspect
 * Returns deep inspection telemetry (wallets, transactions, orders, queue) for a storefront.
 */
router.get('/projects/:id/inspect', requireAdminAuth, async (c) => {
  const db = c.get('db');
  const id = c.req.param('id');
  const data = await inspectAdminProject(db, id);
  return c.json({ success: true, data });
});

/**
 * DELETE /api/v1/admin/projects/:id
 * Safely deletes a storefront and all dependent merchant-scoped records (SUPER_ADMIN only).
 */
router.delete('/projects/:id', requireAdminAuth, requireSuperAdminMiddleware, async (c) => {
  const db = c.get('db');
  const id = c.req.param('id');
  const deleted = await deleteAdminProject(db, id, extractAdminActor(c));
  return c.json({ success: true, data: deleted });
});

/**
 * GET /api/v1/admin/webhooks
 * Audit log of all outgoing webhooks across all projects.
 */
router.get('/webhooks', requireAdminAuth, async (c) => {
  const db = c.get('db');
  const webhooks = await getAdminWebhooks(db);
  return c.json({ success: true, data: webhooks });
});

/**
 * POST /api/v1/admin/webhooks/retry
 * Dispatches pending webhooks with exponential backoff.
 */
router.post('/webhooks/retry', requireAdminAuth, async (c) => {
  const db = c.get('db');
  const result = await processWebhookRetries(db, c.env);
  return c.json({ success: true, data: result });
});

/**
 * GET /api/v1/admin/queue
 * Cross-project pending verification queue.
 */
router.get('/queue', requireAdminAuth, async (c) => {
  const db = c.get('db');
  const queue = await getAdminQueue(db);
  return c.json({ success: true, data: queue });
});

/**
 * POST /api/v1/admin/seed-demo
 * Seeds realistic connected projects for immediate multi-tenant demonstration.
 */
router.post('/seed-demo', requireAdminAuth, async (c) => {
  const db = c.get('db');
  const demoProjects = [
    {
      id: 'mer_live_aurelia_01',
      storeName: 'Aurelia Lifestyle BD',
      webhookUrl: 'https://aurelia.shop/payment/v1',
      gracePeriodMinutes: 60,
    },
    {
      id: 'mer_live_newznbd_02',
      storeName: 'NewznBD Electronics',
      webhookUrl: 'https://newznbd.shop/payment/v1',
      gracePeriodMinutes: 45,
    },
    {
      id: 'mer_live_ecom_03',
      storeName: 'OrbitSaaS Cloud Store',
      webhookUrl: 'https://ecom.orbitsaas.cloud/payment/v1',
      gracePeriodMinutes: 60,
    },
  ];

  const seeded = [];
  for (const p of demoProjects) {
    const existing = await db.select().from(merchants).where(eq(merchants.id, p.id)).limit(1);
    if (!existing[0]) {
      const created = await createAdminProject(
        db,
        createProjectSchema.parse(p),
        c.env.ENCRYPTION_PEPPER || ''
      );
      seeded.push(created);
    }
  }

  return c.json({ success: true, message: `Seeded ${seeded.length} demo projects`, seeded });
});

/**
 * GET /api/v1/admin/projects/:id/users
 * Lists provisioned users and recent JWT sessions for a project.
 */
router.get('/projects/:id/users', requireAdminAuth, async (c) => {
  const db = c.get('db');
  const projectId = c.req.param('id');
  const result = await getProjectUsersAndSessions(db, projectId);
  return c.json({ success: true, data: result });
});

/**
 * POST /api/v1/admin/projects/:id/users
 * Provisions a new user account for a client project.
 */
router.post('/projects/:id/users', requireAdminAuth, async (c) => {
  const db = c.get('db');
  const projectId = c.req.param('id');
  const body = await c.req.json();
  const input = createProjectUserSchema.parse(body);

  const created = await createProjectUser(db, projectId, input);
  return c.json({ success: true, data: created }, 201);
});

/**
 * POST /api/v1/admin/users/:userId/reset-password
 * Resets a user's password and revokes their active sessions.
 */
router.post('/users/:userId/reset-password', requireAdminAuth, async (c) => {
  const db = c.get('db');
  const userId = c.req.param('userId');
  const body = await c.req.json().catch(() => ({}));
  const input = resetUserPasswordSchema.parse(body);

  const result = await resetProjectUserPassword(db, userId, input.password);
  return c.json({ success: true, data: result });
});

/**
 * DELETE /api/v1/admin/sessions/:sessionId
 * Immediately revokes an active JWT auth session.
 */
router.delete('/sessions/:sessionId', requireAdminAuth, async (c) => {
  const db = c.get('db');
  const sessionId = c.req.param('sessionId');
  const result = await revokeAdminSession(db, sessionId);
  return c.json({ success: true, data: result });
});

async function requireProjectMerchant(db: AppDb, projectId: string) {
  const rows = await db.select().from(merchants).where(eq(merchants.id, projectId)).limit(1);
  if (!rows[0]) {
    throw new NotFoundError(`Project '${projectId}' not found`);
  }
  return rows[0];
}

/**
 * POST /api/v1/admin/projects/:id/wallets
 * Registers a new MFS wallet for a merchant project directly from Hub Admin.
 */
router.post('/projects/:id/wallets', requireAdminAuth, async (c) => {
  const db = c.get('db');
  const projectId = c.req.param('id');
  const merchant = await requireProjectMerchant(db, projectId);
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
 * PATCH /api/v1/admin/projects/:id/wallets/:walletId
 * Updates a merchant wallet number or status directly from Hub Admin.
 */
router.patch('/projects/:id/wallets/:walletId', requireAdminAuth, async (c) => {
  const db = c.get('db');
  const projectId = c.req.param('id');
  const walletId = c.req.param('walletId');
  const merchant = await requireProjectMerchant(db, projectId);
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
 * DELETE /api/v1/admin/projects/:id/wallets/:walletId
 * Deletes a wallet belonging to the specified merchant project.
 */
router.delete('/projects/:id/wallets/:walletId', requireAdminAuth, async (c) => {
  const db = c.get('db');
  const projectId = c.req.param('id');
  const walletId = c.req.param('walletId');
  const merchant = await requireProjectMerchant(db, projectId);

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

/**
 * POST /api/v1/admin/projects/:id/payment-links
 * Creates a hosted Payment Link for a merchant project directly from Hub Admin.
 */
router.post('/projects/:id/payment-links', requireAdminAuth, async (c) => {
  const db = c.get('db');
  const projectId = c.req.param('id');
  const merchant = await requireProjectMerchant(db, projectId);
  const body = await c.req.json();
  const input = createPaymentLinkSchema.parse(body);
  const origin = resolvePublicOrigin(c.req.url, c.env.PRODUCTION_DOMAIN);
  const subProject = input.projectId
    ? await resolveAuthorizedProject(db, merchant.id, { requestedProjectId: input.projectId })
    : null;

  const created = await createPaymentLink(db, merchant, input, origin, subProject);
  emitMerchantRealtimeEvent(
    c.env,
    'PAYMENT_LINK_UPDATED',
    { merchantId: merchant.id, projectId: subProject?.id ?? null, action: 'created' },
    merchant.id,
    c
  );
  return c.json({ success: true, data: created }, 201);
});

/**
 * GET /api/v1/admin/projects/:id/sub-projects
 * Lists all sub-projects provisioned under a merchant account.
 */
router.get('/projects/:id/sub-projects', requireAdminAuth, async (c) => {
  const db = c.get('db');
  const merchantId = c.req.param('id');
  await requireProjectMerchant(db, merchantId);
  const items = await listMerchantProjects(db, merchantId);
  return c.json({ success: true, data: items });
});

/**
 * POST /api/v1/admin/projects/:id/sub-projects
 * Provisions a new sub-project under a merchant with Common or Specific SIM wallet assignment.
 */
router.post('/projects/:id/sub-projects', requireAdminAuth, async (c) => {
  const db = c.get('db');
  const merchantId = c.req.param('id');
  await requireProjectMerchant(db, merchantId);
  const body = await c.req.json();
  const input = createSubProjectSchema.parse(body);
  const created = await createMerchantProject(db, merchantId, input, c.env);

  await recordAdminAudit(db, {
    actor: extractAdminActor(c),
    action: 'SUB_PROJECT_CREATED',
    targetType: 'merchant_project',
    targetId: created.project.id,
    metadata: {
      merchantId,
      name: created.project.name,
      walletSelectionMode: created.project.walletSelectionMode,
    },
  });

  emitMerchantRealtimeEvent(
    c.env,
    'WALLET_SYNCED',
    { merchantId, projectId: created.project.id, action: 'project_created' },
    merchantId,
    c
  );
  return c.json({ success: true, data: created }, 201);
});

/**
 * PATCH /api/v1/admin/projects/:id/sub-projects/:subProjectId
 * Updates a sub-project's settings, active status, or assigned SIM wallets.
 */
router.patch('/projects/:id/sub-projects/:subProjectId', requireAdminAuth, async (c) => {
  const db = c.get('db');
  const merchantId = c.req.param('id');
  const subProjectId = c.req.param('subProjectId');
  await requireProjectMerchant(db, merchantId);
  const body = await c.req.json();
  const input = adminUpdateSubProjectSchema.parse(body);
  const updated = await updateMerchantProject(db, merchantId, subProjectId, input, c.env);

  await recordAdminAudit(db, {
    actor: extractAdminActor(c),
    action: 'SUB_PROJECT_UPDATED',
    targetType: 'merchant_project',
    targetId: subProjectId,
    metadata: {
      merchantId,
      walletSelectionMode: updated.walletSelectionMode,
      isActive: updated.isActive,
    },
  });

  return c.json({ success: true, data: updated });
});

/**
 * POST /api/v1/admin/projects/:id/sub-projects/:subProjectId/rotate-keys
 * Rotates a sub-project's API key and/or webhook secret.
 */
router.post('/projects/:id/sub-projects/:subProjectId/rotate-keys', requireAdminAuth, async (c) => {
  const db = c.get('db');
  const merchantId = c.req.param('id');
  const subProjectId = c.req.param('subProjectId');
  await requireProjectMerchant(db, merchantId);
  const body = await c.req.json().catch(() => ({}));
  const input = rotateProjectKeysSchema.parse(body);
  const result = await rotateMerchantProjectKeys(db, merchantId, subProjectId, input.target);

  await recordAdminAudit(db, {
    actor: extractAdminActor(c),
    action: 'SUB_PROJECT_KEYS_ROTATED',
    targetType: 'merchant_project',
    targetId: subProjectId,
    metadata: { merchantId, target: input.target },
  });

  return c.json({ success: true, data: result });
});

/**
 * DELETE /api/v1/admin/projects/:id/sub-projects/:subProjectId
 * Removes a sub-project under a merchant (SUPER_ADMIN only).
 */
router.delete(
  '/projects/:id/sub-projects/:subProjectId',
  requireAdminAuth,
  requireSuperAdminMiddleware,
  async (c) => {
    const db = c.get('db');
    const merchantId = c.req.param('id');
    const subProjectId = c.req.param('subProjectId');
    await requireProjectMerchant(db, merchantId);
    const deleted = await deleteMerchantProject(db, merchantId, subProjectId);

    await recordAdminAudit(db, {
      actor: extractAdminActor(c),
      action: 'SUB_PROJECT_DELETED',
      targetType: 'merchant_project',
      targetId: subProjectId,
      metadata: { merchantId, name: deleted.name },
    });

    return c.json({ success: true, data: deleted });
  }
);

/**
 * POST /api/v1/admin/projects/:id/payments/:paymentIntentId/resolve
 * Manually approves or rejects a pending payment intent for the specified merchant project.
 */
router.post('/projects/:id/payments/:paymentIntentId/resolve', requireAdminAuth, async (c) => {
  const db = c.get('db');
  const projectId = c.req.param('id');
  const paymentIntentId = c.req.param('paymentIntentId');
  const merchant = await requireProjectMerchant(db, projectId);
  const body = await c.req.json();
  const input = resolvePaymentSchema.parse(body);
  const actor = extractAdminActor(c);

  const result = await resolvePaymentIntent(
    db,
    c.env,
    merchant,
    paymentIntentId,
    {
      ...input,
      resolutionSource: 'ORBIT_DASHBOARD',
      resolvedBy: input.resolvedBy ?? {
        id: actor.id ?? undefined,
        email: actor.email ?? undefined,
        role: 'MASTER_ADMIN',
      },
    },
    { ctx: c }
  );

  return c.json({ success: true, data: result });
});

export default router;
