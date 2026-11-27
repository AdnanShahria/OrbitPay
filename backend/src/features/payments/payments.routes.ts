import { Hono } from 'hono';
import { authMerchantMiddleware, authMerchantOrDeviceMiddleware } from '../../shared/middleware';
import type { AppContextEnv } from '../../shared/types';
import {
  backfillPaymentIntentSchema,
  createPaymentIntentSchema,
  listPaymentIntentsQuerySchema,
  paymentActionTriggerSchema,
  resolvePaymentSchema,
} from './payments.schema';
import {
  backfillPaymentIntent,
  createPaymentIntent,
  getPaymentIntentById,
  listPaymentIntents,
  resolvePaymentIntent,
  resolvePublicOrigin,
  triggerPaymentAction,
} from './payments.service';

/**
 * Router mounted at `/api/v1/payment-intents`
 */
export const paymentIntentsRoutes = new Hono<AppContextEnv>();

paymentIntentsRoutes.post('/', authMerchantMiddleware, async (c) => {
  const db = c.get('db');
  const merchant = c.get('merchant')!;
  const body = await c.req.json();
  const input = createPaymentIntentSchema.parse(body);
  const origin = resolvePublicOrigin(c.req.url, c.env.PRODUCTION_DOMAIN);

  const result = await createPaymentIntent(db, c.env, merchant, input, origin);
  return c.json({ success: true, data: result }, result.created ? 201 : 200);
});

paymentIntentsRoutes.post('/backfill', authMerchantMiddleware, async (c) => {
  const db = c.get('db');
  const merchant = c.get('merchant')!;
  const body = await c.req.json();
  const input = backfillPaymentIntentSchema.parse(body);

  const result = await backfillPaymentIntent(db, c.env, merchant, input);
  return c.json({ success: true, data: result }, result.created ? 201 : 200);
});

paymentIntentsRoutes.get('/', authMerchantOrDeviceMiddleware, async (c) => {
  const db = c.get('db');
  const merchant = c.get('merchant')!;
  const query = listPaymentIntentsQuerySchema.parse(c.req.query());

  const result = await listPaymentIntents(db, merchant, query);
  return c.json({ success: true, data: result });
});

paymentIntentsRoutes.get('/:id', authMerchantOrDeviceMiddleware, async (c) => {
  const db = c.get('db');
  const merchant = c.get('merchant')!;
  const id = c.req.param('id');

  const result = await getPaymentIntentById(db, merchant, id);
  return c.json({ success: true, data: result });
});

/**
 * Router mounted at `/api/v1/payments`
 */
export const paymentsRoutes = new Hono<AppContextEnv>();

paymentsRoutes.post('/:id/resolve', authMerchantOrDeviceMiddleware, async (c) => {
  const db = c.get('db');
  const merchant = c.get('merchant')!;
  const id = c.req.param('id');
  const body = await c.req.json();
  const input = resolvePaymentSchema.parse(body);

  const result = await resolvePaymentIntent(db, c.env, merchant, id, input, {
    authType: c.get('authType'),
    userId: c.get('userId'),
    ctx: c,
  });

  return c.json({ success: true, data: result });
});

paymentsRoutes.post('/:id/action', authMerchantOrDeviceMiddleware, async (c) => {
  const db = c.get('db');
  const merchant = c.get('merchant')!;
  const id = c.req.param('id');
  const body = await c.req.json();
  const input = paymentActionTriggerSchema.parse(body);

  const result = await triggerPaymentAction(db, c.env, merchant, id, input, {
    userId: c.get('userId'),
    authType: c.get('authType'),
  });

  return c.json({ success: true, data: result });
});
