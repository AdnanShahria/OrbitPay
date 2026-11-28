import { Hono } from 'hono';
import { ForbiddenError } from '../../shared/errors';
import type { AppContextEnv } from '../../shared/types';
import {
  authMerchantMiddleware,
  authMerchantOrDeviceMiddleware,
} from '../../shared/middleware';
import { resolveAuthorizedProject } from '../projects/projects.service';
import {
  notifyOrderSchema,
  listOrdersQuerySchema,
  orderActionSchema,
} from './orders.schema';
import {
  getOrderByExternalId,
  listOrders,
  notifyOrder,
  performOrderAction,
} from './orders.service';

const router = new Hono<AppContextEnv>();

/**
 * POST /api/v1/orders/notify
 */
router.post('/notify', authMerchantMiddleware, async (c) => {
  const db = c.get('db');
  const merchant = c.get('merchant')!;
  const body = await c.req.json();
  const input = notifyOrderSchema.parse(body);
  const project = await resolveAuthorizedProject(db, merchant.id, {
    requestedProjectId: input.projectId,
    authProject: c.get('project'),
    projectAuthScoped: c.get('projectAuthScoped'),
  });

  const result = await notifyOrder(db, merchant, { ...input, projectId: project?.id }, c.env);
  return c.json({ success: true, data: result.order }, result.created ? 201 : 200);
});

/**
 * GET /api/v1/orders
 */
router.get('/', authMerchantOrDeviceMiddleware, async (c) => {
  const db = c.get('db');
  const merchantId = c.get('merchantId')!;
  const query = listOrdersQuerySchema.parse(c.req.query());
  const project = await resolveAuthorizedProject(db, merchantId, {
    requestedProjectId: query.projectId,
    authProject: c.get('project'),
    projectAuthScoped: c.get('projectAuthScoped'),
    requireActive: false,
  });

  const result = await listOrders(db, merchantId, { ...query, projectId: project?.id });
  return c.json({ success: true, data: result });
});

/**
 * GET /api/v1/orders/:externalOrderId
 */
router.get('/:externalOrderId', authMerchantOrDeviceMiddleware, async (c) => {
  const db = c.get('db');
  const merchantId = c.get('merchantId')!;
  const externalOrderId = c.req.param('externalOrderId');

  const result = await getOrderByExternalId(db, merchantId, externalOrderId);
  if (c.get('projectAuthScoped') && result.projectId !== c.get('projectId')) {
    throw new ForbiddenError('Project credentials cannot access another project order');
  }
  return c.json({ success: true, data: result });
});

/**
 * POST /api/v1/orders/:externalOrderId/action
 */
router.post('/:externalOrderId/action', authMerchantOrDeviceMiddleware, async (c) => {
  const db = c.get('db');
  const merchant = c.get('merchant')!;
  const externalOrderId = c.req.param('externalOrderId');
  const body = await c.req.json();
  const input = orderActionSchema.parse(body);

  if (c.get('projectAuthScoped')) {
    const existing = await getOrderByExternalId(db, merchant.id, externalOrderId);
    if (existing.projectId !== c.get('projectId')) {
      throw new ForbiddenError('Project credentials cannot modify another project order');
    }
  }

  const result = await performOrderAction(db, merchant, externalOrderId, input, c.env);
  return c.json({ success: true, data: result });
});

export default router;
