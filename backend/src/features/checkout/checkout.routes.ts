import { Hono } from 'hono';
import { and, eq } from 'drizzle-orm';
import { merchants } from '../../db/schema';
import { base64ToUint8 } from '../../router/image';
import { BadRequestError, NotFoundError } from '../../shared/errors';
import { authMerchantOrDeviceMiddleware } from '../../shared/middleware';
import type { AppContextEnv } from '../../shared/types';
import { checkoutResolveAliasSchema } from '../payments/payments.schema';
import { resolvePaymentIntent, resolvePublicOrigin } from '../payments/payments.service';
import { realtimeHub } from '../realtime/realtime.service';
import { createSessionSchema, verifyCheckoutSchema } from './checkout.schema';
import {
  createCheckoutSession,
  getCheckoutStatus,
  getPublicCheckoutSession,
  uploadCheckoutReceipt,
  verifyCheckoutPayment,
} from './checkout.service';

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
    input.provider,
    c.env
  );

  return c.json({ success: true, data: session }, 201);
});

/**
 * GET /api/v1/checkout/sessions/:sessionId
 * Public immutable session hydration endpoint for Hosted Checkout & Embedded Widget.
 */
router.get('/sessions/:sessionId', async (c) => {
  const db = c.get('db');
  const sessionId = c.req.param('sessionId');
  const data = await getPublicCheckoutSession(db, c.env, sessionId);
  return c.json({ success: true, data });
});

/**
 * POST /api/v1/checkout/receipt
 * Signed sessionToken-authenticated payment proof screenshot upload (PNG/JPEG/WEBP, max 3).
 */
router.post('/receipt', async (c) => {
  const db = c.get('db');
  const contentType = c.req.header('content-type') || '';
  const headerToken = c.req.header('x-session-token')?.trim() || '';
  const origin = resolvePublicOrigin(c.req.url, c.env.PRODUCTION_DOMAIN);

  let sessionToken = headerToken;
  let fileName = 'receipt.png';
  let mimeType = 'image/png';
  let bytes: Uint8Array;

  if (contentType.includes('multipart/form-data')) {
    const formData = await c.req.formData();
    const file = formData.get('file');
    if (!file || !(file instanceof File)) {
      throw new BadRequestError("Missing 'file' field in multipart/form-data upload");
    }
    const formToken = formData.get('sessionToken');
    if (!sessionToken && typeof formToken === 'string') {
      sessionToken = formToken.trim();
    }
    fileName = file.name || 'receipt.png';
    mimeType = file.type || 'image/png';
    bytes = new Uint8Array(await file.arrayBuffer());
  } else {
    const body = (await c.req.json()) as {
      sessionToken?: string;
      fileName?: string;
      mimeType?: string;
      base64?: string;
    };
    if (!sessionToken && body.sessionToken) {
      sessionToken = body.sessionToken.trim();
    }
    if (!body.base64) {
      throw new BadRequestError("Missing 'base64' or multipart 'file' payload");
    }
    fileName = body.fileName || 'receipt.png';
    mimeType = body.mimeType || 'image/png';
    bytes = base64ToUint8(body.base64);
  }

  const result = await uploadCheckoutReceipt(db, c.env, {
    sessionToken,
    fileName,
    mimeType,
    bytes,
    origin,
  });

  return c.json({ success: true, data: result }, 201);
});

/**
 * POST /api/v1/checkout/verify
 * Customer submits TrxID and Phone Number from modal or client widget.
 */
router.post('/verify', async (c) => {
  const db = c.get('db');
  const body = await c.req.json();
  const input = verifyCheckoutSchema.parse(body);

  const merchantRes = await db
    .select()
    .from(merchants)
    .where(and(eq(merchants.id, input.merchantId), eq(merchants.isActive, true)))
    .limit(1);

  const merchant = merchantRes[0];
  if (!merchant) {
    throw new NotFoundError(`Merchant '${input.merchantId}' not found or inactive`);
  }

  const result = await verifyCheckoutPayment(db, merchant, input, c.env, c);

  if (result.status === 'VERIFIED') {
    realtimeHub.broadcast(
      'PAYMENT_VERIFIED',
      {
        paymentIntentId: result.paymentIntentId,
        orderId: input.orderId,
        trxId: result.trxId || input.trxId,
        amount: result.paidAmount ?? result.amount ?? input.paidAmount ?? input.amount,
        baseAmount: result.baseAmount,
        uniqueAmount: result.uniqueAmount,
        matchType: result.matchType,
        provider: input.provider,
      },
      merchant.id
    );
  } else {
    realtimeHub.broadcast(
      'QUEUE_UPDATED',
      {
        paymentIntentId: result.paymentIntentId,
        orderId: input.orderId,
        trxId: input.trxId,
        expectedAmount: input.paidAmount ?? input.amount,
        provider: input.provider,
        status: result.status,
        escalationReason: result.escalationReason,
      },
      merchant.id
    );
  }

  return c.json({ success: true, data: result });
});

/**
 * POST /api/v1/checkout/resolve
 * Alias for `/api/v1/payments/:id/resolve` supporting reverse-sync from client admin panels.
 */
router.post('/resolve', authMerchantOrDeviceMiddleware, async (c) => {
  const db = c.get('db');
  const merchant = c.get('merchant')!;
  const body = await c.req.json();
  const input = checkoutResolveAliasSchema.parse(body);

  const targetId = input.paymentIntentId || input.externalOrderId;
  if (!targetId) {
    throw new BadRequestError('Either paymentIntentId or externalOrderId is required');
  }

  const result = await resolvePaymentIntent(db, c.env, merchant, targetId, input, {
    authType: c.get('authType'),
    userId: c.get('userId'),
    ctx: c,
  });

  return c.json({ success: true, data: result });
});

/**
 * GET /api/v1/checkout/status
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
