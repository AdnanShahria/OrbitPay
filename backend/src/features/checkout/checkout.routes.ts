import { Hono } from 'hono';
import { eq, and } from 'drizzle-orm';
import type { AppContextEnv } from '../../shared/types';
import { merchants } from '../../db/schema';
import { NotFoundError } from '../../shared/errors';
import { createSessionSchema, verifyCheckoutSchema } from './checkout.schema';
import { createCheckoutSession, verifyCheckoutPayment, getCheckoutStatus } from './checkout.service';
import { realtimeHub } from '../realtime/realtime.service';

const router = new Hono<AppContextEnv>();

/**
 * POST /api/v1/checkout/session
 * Public or storefront initiated endpoint to generate session and rotate active SIM wallets.
 */
router.post('/session', async (c) => {
  const db = c.get('db');
  const body = await c.req.json();
  const input = createSessionSchema.parse(body);

  const session = await createCheckoutSession(
    db,
    input.merchantId,
    input.orderId,
    input.amount,
    input.customerEmail,
    input.provider
  );

  return c.json({ success: true, data: session }, 201);
});

/**
 * POST /api/v1/checkout/verify
 * Customer submits TrxID and Phone Number from modal or client widget.
 */
router.post('/verify', async (c) => {
  const db = c.get('db');
  const body = await c.req.json();
  const input = verifyCheckoutSchema.parse(body);

  // Lookup merchant
  const merchantRes = await db
    .select()
    .from(merchants)
    .where(and(eq(merchants.id, input.merchantId), eq(merchants.isActive, true)))
    .limit(1);

  const merchant = merchantRes[0];
  if (!merchant) {
    throw new NotFoundError(`Merchant '${input.merchantId}' not found or inactive`);
  }

  const result = await verifyCheckoutPayment(db, merchant, input, c.env);

  if (result.status === 'VERIFIED') {
    realtimeHub.broadcast('PAYMENT_VERIFIED', {
      orderId: input.orderId,
      trxId: result.trxId || input.trxId,
      amount: result.paidAmount ?? result.amount ?? input.paidAmount ?? input.amount,
      baseAmount: result.baseAmount,
      uniqueAmount: result.uniqueAmount,
      matchType: result.matchType,
      provider: input.provider,
    });
  } else {
    realtimeHub.broadcast('QUEUE_UPDATED', {
      orderId: input.orderId,
      trxId: input.trxId,
      expectedAmount: input.paidAmount ?? input.amount,
      provider: input.provider,
    });
  }

  return c.json({ success: true, data: result });
});

/**
 * GET /api/v1/checkout/status
 * Query param endpoint (merchantId, orderId, trxId) for CheckoutModal / PollingStatus.tsx.
 */
router.get('/status', async (c) => {
  const db = c.get('db');
  const orderId = c.req.query('orderId');
  const merchantId = c.req.query('merchantId');

  if (!orderId || !merchantId) {
    return c.json({ success: false, error: 'Query parameters orderId and merchantId are required' }, 400);
  }

  const statusResult = await getCheckoutStatus(db, merchantId, orderId);
  return c.json(statusResult);
});

/**
 * GET /api/v1/checkout/status/:orderId
 * Polling endpoint for CheckoutModal / PollingStatus.tsx to track verification progress.
 */
router.get('/status/:orderId', async (c) => {
  const db = c.get('db');
  const orderId = c.req.param('orderId');
  const merchantId = c.req.query('merchantId');

  if (!merchantId) {
    return c.json({ success: false, error: 'Query parameter merchantId is required' }, 400);
  }

  const statusResult = await getCheckoutStatus(db, merchantId, orderId);
  return c.json({ success: true, data: statusResult });
});

export default router;
