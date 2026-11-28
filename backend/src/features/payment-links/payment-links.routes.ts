import { Hono } from 'hono';
import { ForbiddenError } from '../../shared/errors';
import {
  authMerchantMiddleware,
  authMerchantOrDeviceMiddleware,
  requireOwnerRoleMiddleware,
} from '../../shared/middleware';
import type { AppContextEnv } from '../../shared/types';
import { resolvePublicOrigin } from '../payments/payments.service';
import { resolveAuthorizedProject } from '../projects/projects.service';
import { emitMerchantRealtimeEvent } from '../realtime/realtime.service';
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

// Merchant-scoped public routes: /:merchantSlug/:slug (must precede `/:id`)
router.get('/public/m/:merchantSlug/:slug', async (c) => {
  const db = c.get('db');
  const merchantSlug = c.req.param('merchantSlug');
  const slug = c.req.param('slug');
  const origin = resolvePublicOrigin(c.req.url, c.env.PRODUCTION_DOMAIN);
  const data = await getPublicPaymentLink(db, c.env, slug, origin, merchantSlug);
  return c.json({ success: true, data });
});

router.post('/public/m/:merchantSlug/:slug/pay', async (c) => {
  const db = c.get('db');
  const merchantSlug = c.req.param('merchantSlug');
  const slug = c.req.param('slug');
  const body = await c.req.json().catch(() => ({}));
  const input = payPaymentLinkSchema.parse(body);
  const origin = resolvePublicOrigin(c.req.url, c.env.PRODUCTION_DOMAIN);

  const data = await payPublicPaymentLink(db, c.env, slug, input, origin, merchantSlug);
  return c.json({ success: true, data }, 201);
});

// Legacy public routes: /l/:slug (backward compatibility)
router.get('/public/:slug', async (c) => {
  const db = c.get('db');
  const slug = c.req.param('slug');
  const origin = resolvePublicOrigin(c.req.url, c.env.PRODUCTION_DOMAIN);
  const data = await getPublicPaymentLink(db, c.env, slug, origin);
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
  const origin = resolvePublicOrigin(c.req.url, c.env.PRODUCTION_DOMAIN);
  const queryProjectId = c.req.query('projectId')?.trim();
  const project = await resolveAuthorizedProject(db, merchant.id, {
    requestedProjectId: queryProjectId,
    authProject: c.get('project'),
    projectAuthScoped: c.get('projectAuthScoped'),
    requireActive: false,
  });
  const items = await listPaymentLinks(db, merchant, origin, project?.id);
  return c.json({ success: true, data: items });
});

router.post('/', authMerchantMiddleware, requireOwnerRoleMiddleware, async (c) => {
  const db = c.get('db');
  const merchant = c.get('merchant')!;
  const body = await c.req.json();
  const input = createPaymentLinkSchema.parse(body);
  const origin = resolvePublicOrigin(c.req.url, c.env.PRODUCTION_DOMAIN);
  const project = await resolveAuthorizedProject(db, merchant.id, {
    requestedProjectId: input.projectId,
    authProject: c.get('project'),
    projectAuthScoped: c.get('projectAuthScoped'),
  });
  const created = await createPaymentLink(db, merchant, input, origin, project);
  emitMerchantRealtimeEvent(
    c.env,
    'PAYMENT_LINK_UPDATED',
    { merchantId: merchant.id, projectId: project?.id ?? null, action: 'created' },
    merchant.id,
    c
  );
  return c.json({ success: true, data: created }, 201);
});

router.get('/:id', authMerchantOrDeviceMiddleware, async (c) => {
  const db = c.get('db');
  const merchant = c.get('merchant')!;
  const id = c.req.param('id');
  const origin = resolvePublicOrigin(c.req.url, c.env.PRODUCTION_DOMAIN);
  const link = await getPaymentLinkById(db, merchant, id, origin);
  if (c.get('projectAuthScoped') && link.projectId !== c.get('projectId')) {
    throw new ForbiddenError('Project credentials cannot access another project payment link');
  }
  return c.json({ success: true, data: link });
});

router.patch('/:id', authMerchantMiddleware, requireOwnerRoleMiddleware, async (c) => {
  const db = c.get('db');
  const merchant = c.get('merchant')!;
  const id = c.req.param('id');
  const body = await c.req.json();
  const input = updatePaymentLinkSchema.parse(body);
  const origin = resolvePublicOrigin(c.req.url, c.env.PRODUCTION_DOMAIN);

  if (c.get('projectAuthScoped')) {
    const existing = await getPaymentLinkById(db, merchant, id, origin);
    if (existing.projectId !== c.get('projectId')) {
      throw new ForbiddenError('Project credentials cannot modify another project payment link');
    }
    if (input.projectId !== undefined && input.projectId !== c.get('projectId')) {
      throw new ForbiddenError('Project credentials cannot reassign a link to another project');
    }
  } else if (input.projectId) {
    await resolveAuthorizedProject(db, merchant.id, {
      requestedProjectId: input.projectId,
    });
  }

  const updated = await updatePaymentLink(db, merchant, id, input, origin);
  emitMerchantRealtimeEvent(
    c.env,
    'PAYMENT_LINK_UPDATED',
    { merchantId: merchant.id, projectId: updated.projectId, action: 'updated' },
    merchant.id,
    c
  );
  return c.json({ success: true, data: updated });
});

router.delete('/:id', authMerchantMiddleware, requireOwnerRoleMiddleware, async (c) => {
  const db = c.get('db');
  const merchant = c.get('merchant')!;
  const id = c.req.param('id');
  if (c.get('projectAuthScoped')) {
    const existing = await getPaymentLinkById(db, merchant, id);
    if (existing.projectId !== c.get('projectId')) {
      throw new ForbiddenError('Project credentials cannot delete another project payment link');
    }
  }
  const result = await deletePaymentLink(db, merchant, id);
  emitMerchantRealtimeEvent(
    c.env,
    'PAYMENT_LINK_UPDATED',
    { merchantId: merchant.id, action: 'deleted' },
    merchant.id,
    c
  );
  return c.json({ success: true, data: result });
});

export default router;
