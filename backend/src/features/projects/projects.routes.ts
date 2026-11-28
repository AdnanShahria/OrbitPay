import { Hono } from 'hono';
import { ForbiddenError } from '../../shared/errors';
import {
  authMerchantMiddleware,
  authMerchantOrDeviceMiddleware,
  requireMerchantWideScopeMiddleware,
  requireOwnerRoleMiddleware,
} from '../../shared/middleware';
import type { AppContextEnv } from '../../shared/types';
import { assertSetupUnlockedForJwt } from '../merchants/setup-lock.service';
import {
  merchantUpdateSubProjectSchema,
  rotateProjectKeysSchema,
} from './projects.schema';
import {
  getMerchantProjectById,
  listMerchantProjects,
  rotateMerchantProjectKeys,
  updateMerchantProject,
} from './projects.service';

const router = new Hono<AppContextEnv>();

/**
 * GET /api/v1/projects
 * Lists active sub-projects provisioned under the authenticated merchant.
 */
router.get('/', authMerchantOrDeviceMiddleware, async (c) => {
  const db = c.get('db');
  const merchantId = c.get('merchantId')!;
  const scopedProjectId = c.get('projectAuthScoped') ? c.get('projectId') : undefined;
  const projects = await listMerchantProjects(db, merchantId, {
    activeOnly: true,
    scopedProjectId,
  });
  return c.json({ success: true, data: projects });
});

/**
 * GET /api/v1/projects/:id
 * Retrieves a single sub-project under the authenticated merchant.
 */
router.get('/:id', authMerchantOrDeviceMiddleware, async (c) => {
  const db = c.get('db');
  const merchantId = c.get('merchantId')!;
  const id = c.req.param('id');

  if (c.get('projectAuthScoped') && c.get('projectId') !== id) {
    throw new ForbiddenError('Project credentials cannot inspect another project');
  }

  const project = await getMerchantProjectById(db, merchantId, id);
  return c.json({ success: true, data: project });
});

/**
 * PATCH /api/v1/projects/:id
 * Allows the Merchant Owner (setup-unlocked for JWT) to configure a provisioned project's
 * website integration, webhook URL, verification mode, or Common/Specific SIM wallet bindings.
 */
router.patch('/:id', authMerchantMiddleware, requireOwnerRoleMiddleware, requireMerchantWideScopeMiddleware, async (c) => {
  await assertSetupUnlockedForJwt(c);
  const db = c.get('db');
  const merchantId = c.get('merchantId')!;
  const id = c.req.param('id');

  if (c.get('projectAuthScoped') && c.get('projectId') !== id) {
    throw new ForbiddenError('Project credentials cannot modify another project');
  }

  const body = await c.req.json();
  const input = merchantUpdateSubProjectSchema.parse(body);
  const updated = await updateMerchantProject(db, merchantId, id, input, c.env);
  return c.json({ success: true, data: updated });
});

/**
 * POST /api/v1/projects/:id/keys/rotate
 * Rotates a sub-project's API key and/or webhook secret (Merchant Owner + Setup Lock required).
 */
router.post('/:id/keys/rotate', authMerchantMiddleware, requireOwnerRoleMiddleware, requireMerchantWideScopeMiddleware, async (c) => {
  await assertSetupUnlockedForJwt(c);
  const db = c.get('db');
  const merchantId = c.get('merchantId')!;
  const id = c.req.param('id');

  if (c.get('projectAuthScoped') && c.get('projectId') !== id) {
    throw new ForbiddenError('Project credentials cannot rotate keys for another project');
  }

  const body = await c.req.json().catch(() => ({}));
  const input = rotateProjectKeysSchema.parse(body);
  const result = await rotateMerchantProjectKeys(db, merchantId, id, input.target);
  return c.json({ success: true, data: result });
});

export default router;
