import { Hono } from 'hono';
import type { AppContextEnv } from '../../shared/types';
import {
  authenticateAdminJwt,
  authMasterAdminMiddleware,
  requireSuperAdminMiddleware,
  resolveMasterAdminKey,
} from '../../shared/middleware';
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
  revokeSpecificAdminSession,
  updateAdminUser,
} from './admin-auth.service';
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
  await ensureRuntimeSchema(db);
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
  const projects = await getAdminProjects(db);
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

  const result = await createAdminProject(db, input, c.env.ENCRYPTION_PEPPER || '');
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

  const updated = await updateAdminProject(db, id, input);
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
      const created = await createAdminProject(db, p, c.env.ENCRYPTION_PEPPER || '');
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

export default router;
