import { Hono } from 'hono';
import {
  authMerchantMiddleware,
  authMerchantOrDeviceMiddleware,
  requireOwnerRoleMiddleware,
} from '../../shared/middleware';
import type { AppContextEnv } from '../../shared/types';
import { resolvePublicOrigin } from '../payments/payments.service';
import {
  createPaymentLinkSchema,
  payPaymentLinkSchema,
  updatePaymentLinkSchema,
} from './payment-links.schema';
import {
  createPaymentLink,
  deletePaymentLink,
  getPaymentLinkById,
  getPublicPaymentLink,
  listPaymentLinks,
  payPublicPaymentLink,
  updatePaymentLink,
} from './payment-links.service';

const router = new Hono<AppContextEnv>();

// Public routes (must precede `/:id`)
router.get('/public/:slug', async (c) => {
  const db = c.get('db');
  const slug = c.req.param('slug');
  const data = await getPublicPaymentLink(db, c.env, slug);
  return c.json({ success: true, data });
});

router.post('/public/:slug/pay', async (c) => {
  const db = c.get('db');
  const slug = c.req.param('slug');
  const body = await c.req.json().catch(() => ({}));
  const input = payPaymentLinkSchema.parse(body);
  const origin = resolvePublicOrigin(c.req.url, c.env.PRODUCTION_DOMAIN);

  const data = await payPublicPaymentLink(db, c.env, slug, input, origin);
  return c.json({ success: true, data }, 201);
});

// Authenticated merchant routes
router.get('/', authMerchantOrDeviceMiddleware, async (c) => {
  const db = c.get('db');
  const merchant = c.get('merchant')!;
  const items = await listPaymentLinks(db, merchant);
  return c.json({ success: true, data: items });
});

router.post('/', authMerchantMiddleware, requireOwnerRoleMiddleware, async (c) => {
  const db = c.get('db');
  const merchant = c.get('merchant')!;
  const body = await c.req.json();
  const input = createPaymentLinkSchema.parse(body);
  const created = await createPaymentLink(db, merchant, input);
  return c.json({ success: true, data: created }, 201);
});

router.get('/:id', authMerchantOrDeviceMiddleware, async (c) => {
  const db = c.get('db');
  const merchant = c.get('merchant')!;
  const id = c.req.param('id');
  const link = await getPaymentLinkById(db, merchant, id);
  return c.json({ success: true, data: link });
});

router.patch('/:id', authMerchantMiddleware, requireOwnerRoleMiddleware, async (c) => {
  const db = c.get('db');
  const merchant = c.get('merchant')!;
  const id = c.req.param('id');
  const body = await c.req.json();
  const input = updatePaymentLinkSchema.parse(body);
  const updated = await updatePaymentLink(db, merchant, id, input);
  return c.json({ success: true, data: updated });
});

router.delete('/:id', authMerchantMiddleware, requireOwnerRoleMiddleware, async (c) => {
  const db = c.get('db');
  const merchant = c.get('merchant')!;
  const id = c.req.param('id');
  const result = await deletePaymentLink(db, merchant, id);
  return c.json({ success: true, data: result });
});

export default router;
