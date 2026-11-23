import { Hono } from 'hono';
import type { AppContextEnv } from '../../shared/types';
import {
  authMerchantMiddleware,
  authMerchantOrDeviceMiddleware,
} from '../../shared/middleware';
import {
  notifyOrderSchema,
  listOrdersQuerySchema,
  orderActionSchema,
} from './orders.schema';
import { notifyOrder, listOrders, performOrderAction } from './orders.service';

const router = new Hono<AppContextEnv>();

/**
 * POST /api/v1/orders/notify
 * Storefront-initiated order notification (MFS, COD, Card, Bank Transfer, Other).
 */
router.post('/notify', authMerchantMiddleware, async (c) => {
  const db = c.get('db');
  const merchant = c.get('merchant')!;
  const body = await c.req.json();
  const input = notifyOrderSchema.parse(body);

  const result = await notifyOrder(db, merchant, input, c.env);
  return c.json({ success: true, data: result.order }, result.created ? 201 : 200);
});

/**
 * GET /api/v1/orders
 * Lists synchronized orders for Merchant Dashboard (JWT/Secret) or Android Companion (Device Key/JWT).
 */
router.get('/', authMerchantOrDeviceMiddleware, async (c) => {
  const db = c.get('db');
  const merchantId = c.get('merchantId')!;
  const query = listOrdersQuerySchema.parse(c.req.query());

  const result = await listOrders(db, merchantId, query);
  return c.json({ success: true, data: result });
});

/**
 * POST /api/v1/orders/:externalOrderId/action
 * Performs merchant confirmation/fulfillment actions and dispatches signed webhook back to storefront.
 */
router.post('/:externalOrderId/action', authMerchantOrDeviceMiddleware, async (c) => {
  const db = c.get('db');
  const merchant = c.get('merchant')!;
  const externalOrderId = c.req.param('externalOrderId');
  const body = await c.req.json();
  const input = orderActionSchema.parse(body);

  const result = await performOrderAction(db, merchant, externalOrderId, input);
  return c.json({ success: true, data: result });
});

export default router;
