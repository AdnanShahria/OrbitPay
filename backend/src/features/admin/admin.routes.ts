import { Hono } from 'hono';
import type { AppContextEnv } from '../../shared/types';
import { UnauthorizedError } from '../../shared/errors';
import {
  verifyAdminKeySchema,
  createProjectSchema,
  updateProjectSchema,
  createProjectUserSchema,
  resetUserPasswordSchema,
} from './admin.schema';
import {
  getAdminOverview,
  getAdminProjects,
  createAdminProject,
  updateAdminProject,
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

// Helper to get master key with development default
function getMasterKey(envMasterKey?: string): string {
  return envMasterKey || 'orbit_master_admin_2026';
}

/**
 * Master Admin Key Middleware
 */
const requireAdminAuth = async (c: any, next: any) => {
  const adminKey = c.req.header('x-admin-key') || c.req.query('adminKey');
  const expectedKey = getMasterKey(c.env.MASTER_ADMIN_KEY);

  if (!adminKey || adminKey !== expectedKey) {
    throw new UnauthorizedError('Invalid or missing Master Admin Key');
  }

  await next();
};

/**
 * POST /api/v1/admin/auth/verify
 * Validates admin key and returns session token/confirmation.
 */
router.post('/auth/verify', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const input = verifyAdminKeySchema.parse(body);
  const expectedKey = getMasterKey(c.env.MASTER_ADMIN_KEY);

  if (input.adminKey !== expectedKey) {
    return c.json({ success: false, error: 'Incorrect Master Admin Key' }, 401);
  }

  return c.json({
    success: true,
    data: {
      role: 'MASTER_ADMIN',
      authenticatedAt: new Date().toISOString(),
      expiresIn: 86400,
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
  const result = await processWebhookRetries(db);
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
