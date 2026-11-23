import { Hono } from 'hono';
import type { AppContextEnv } from '../../shared/types';
import { authDeviceMiddleware, authMerchantOrDeviceMiddleware } from '../../shared/middleware';
import { ingestSmsBatchSchema, heartbeatSchema } from './device.schema';
import { ingestDeviceSmsBatch, getDeviceStats, recordDeviceHeartbeat } from './device.service';
import { listOrdersQuerySchema, orderActionSchema } from '../orders/orders.schema';
import { listOrders, performOrderAction } from '../orders/orders.service';
import { realtimeHub } from '../realtime/realtime.service';

const router = new Hono<AppContextEnv>();

/**
 * POST /api/v1/device/ingest
 * Ingests a batch of parsed SMS from the native Kotlin companion app.
 * Authenticated via X-Device-Key header or Bearer JWT.
 */
router.post('/ingest', authDeviceMiddleware, async (c) => {
  const db = c.get('db');
  const merchant = c.get('merchant')!;
  const body = await c.req.json();
  const input = ingestSmsBatchSchema.parse(body);

  const result = await ingestDeviceSmsBatch(
    db,
    merchant,
    input.messages,
    c.env
  );

  return c.json({ success: true, data: result });
});

/**
 * GET /api/v1/device/stats
 * Telemetry endpoint providing live volume, counts, and recent 50 transactions.
 * Accessible via X-Device-Key, X-Merchant-Secret, or Bearer JWT.
 */
router.get('/stats', authMerchantOrDeviceMiddleware, async (c) => {
  const db = c.get('db');
  const merchantId = c.get('merchantId')!;
  const stats = await getDeviceStats(db, merchantId);
  return c.json({ success: true, data: stats });
});

/**
 * POST /api/v1/device/heartbeat
 * Companion app background pings to maintain live online status and register FCM token.
 */
router.post('/heartbeat', authDeviceMiddleware, async (c) => {
  const db = c.get('db');
  const merchantId = c.get('merchantId')!;
  const body = await c.req.json().catch(() => ({}));
  const input = heartbeatSchema.parse(body);

  await recordDeviceHeartbeat(db, merchantId, input.fcmToken, c.req.header('x-device-key'), c.env.ENCRYPTION_PEPPER);
  realtimeHub.broadcast('DEVICE_HEARTBEAT', {
    merchantId,
    isOnline: true,
    lastSeenAt: new Date().toISOString(),
  });
  return c.json({ success: true, message: 'Heartbeat acknowledged' });
});

/**
 * GET /api/v1/device/orders
 * Convenience endpoint for Android companion app to list synchronized storefront orders.
 */
router.get('/orders', authDeviceMiddleware, async (c) => {
  const db = c.get('db');
  const merchantId = c.get('merchantId')!;
  const query = listOrdersQuerySchema.parse(c.req.query());

  const result = await listOrders(db, merchantId, query);
  return c.json({ success: true, data: result });
});

/**
 * POST /api/v1/device/orders/:externalOrderId/action
 * Convenience endpoint for Android companion app to confirm, ship, mark paid, or cancel orders.
 */
router.post('/orders/:externalOrderId/action', authDeviceMiddleware, async (c) => {
  const db = c.get('db');
  const merchant = c.get('merchant')!;
  const externalOrderId = c.req.param('externalOrderId');
  const body = await c.req.json();
  const input = orderActionSchema.parse(body);

  const result = await performOrderAction(db, merchant, externalOrderId, input);
  return c.json({ success: true, data: result });
});

export default router;
