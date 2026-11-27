import { Hono, type MiddlewareHandler } from 'hono';
import { z } from 'zod';
import { desc, eq } from 'drizzle-orm';
import { routerProviderLogs } from '../db/schema';
import { BadRequestError, ForbiddenError, UnauthorizedError } from '../shared/errors';
import { toExactArrayBuffer } from '../shared/crypto';
import {
  authDeviceMiddleware,
  authMasterAdminMiddleware,
  authMerchantMiddleware,
  resolveJwtSecret,
} from '../shared/middleware';
import type { AppContextEnv } from '../shared/types';
import { getDatabaseProviderCapabilities, checkPrimaryDatabaseHealth, routeKvDelete, routeKvGet, routeKvSet } from './database';
import { getEmailProviderCapabilities, routeEmail } from './email';
import {
  base64ToUint8,
  getImageProviderCapabilities,
  getMediaAssetRecord,
  routeImageDelete,
  routeImageDownload,
  routeImageUpload,
  verifyProofAssetToken,
} from './image';
import { createHealthSnapshot } from './secrets';
import { getSmsProviderCapabilities, routeSmsOrPush } from './sms';

const router = new Hono<AppContextEnv>();

/**
 * Backend Verification Gate
 * Ensures every router operation is invoked by an authenticated Admin, Merchant, or Device.
 */
const authRouterCallerMiddleware: MiddlewareHandler<AppContextEnv> = async (c, next) => {
  const adminKey = c.req.header('x-admin-key');
  if (adminKey) {
    return authMasterAdminMiddleware(c, async () => {
      c.set('merchantId', 'master_admin');
      await next();
    });
  }

  const deviceKey = c.req.header('x-device-key');
  if (deviceKey) {
    return authDeviceMiddleware(c, next);
  }

  const merchantCredential =
    c.req.header('x-merchant-api-key') ||
    c.req.header('x-merchant-secret') ||
    c.req.header('authorization');
  if (merchantCredential) {
    return authMerchantMiddleware(c, next);
  }

  throw new UnauthorizedError(
    'Backend verification required: provide X-Merchant-Api-Key, X-Merchant-Secret, Authorization: Bearer, X-Device-Key, or X-Admin-Key'
  );
};

/**
 * Blocks X-Device-Key credentials from accessing privileged messaging, KV, or asset deletion endpoints.
 */
const blockDeviceKeyMiddleware: MiddlewareHandler<AppContextEnv> = async (c, next) => {
  if (c.get('authType') === 'device' || Boolean(c.req.header('x-device-key')?.trim())) {
    throw new ForbiddenError('Device credentials are not permitted on this router endpoint');
  }
  await next();
};

function scopeTenantKvKey(callerId: string | undefined, key: string): string {
  const tenant = callerId || 'anonymous';
  return `tenant:${tenant}:${key}`;
}

const sendEmailSchema = z.object({
  to: z.union([z.string().email(), z.array(z.string().email()).min(1).max(50)]),
  subject: z.string().min(1).max(300),
  html: z.string().max(500_000).optional(),
  text: z.string().max(200_000).optional(),
  from: z.string().email().optional(),
  fromName: z.string().max(120).optional(),
  replyTo: z.string().email().optional(),
  preferredProvider: z
    .enum([
      'orbitmail',
      'resend',
      'brevo',
      'sendpulse',
      'aws_ses',
      'sendgrid',
      'cloudflare',
      'apps_script',
      'custom_webhook',
    ])
    .optional(),
}).refine((v) => Boolean(v.html || v.text), {
  message: 'Either html or text body must be provided',
});

const sendSmsSchema = z.object({
  to: z.string().min(6).max(20).optional(),
  message: z.string().min(1).max(1600),
  title: z.string().max(120).optional(),
  fcmToken: z.string().min(10).optional(),
  data: z.record(z.string()).optional(),
  preferredProvider: z
    .enum(['fcm', 'bulksmsbd', 'ssl_wireless', 'twilio', 'custom_webhook'])
    .optional(),
}).refine((v) => Boolean(v.to || v.fcmToken), {
  message: 'Either recipient phone number (to) or fcmToken must be provided',
});

const imageJsonUploadSchema = z.object({
  fileName: z.string().min(1).max(180).default('image.png'),
  mimeType: z.string().min(3).max(80).default('image/png'),
  base64: z.string().min(4),
  preferredProvider: z.enum(['r2', 'imgbb', 'supabase', 'mongodb', 'd1']).optional(),
});

const kvSetSchema = z.object({
  key: z.string().min(1).max(200),
  value: z.unknown(),
  ttlSeconds: z.number().int().positive().max(31536000).optional(),
  preferredProvider: z.enum(['d1', 'kv', 'supabase', 'mongodb', 'turso']).optional(),
});

/**
 * GET /api/v1/router/health
 */
router.get('/health', authRouterCallerMiddleware, async (c) => {
  const snapshot = createHealthSnapshot({
    email: getEmailProviderCapabilities(c.env),
    sms: getSmsProviderCapabilities(c.env),
    image: getImageProviderCapabilities(c.env),
    database: getDatabaseProviderCapabilities(c.env),
  });
  return c.json({ success: true, data: snapshot });
});

/**
 * GET /api/v1/router/logs
 * Tenant-scoped failover & routing audit logs from D1.
 */
router.get('/logs', authRouterCallerMiddleware, async (c) => {
  const db = c.get('db');
  const callerId = c.get('merchantId');

  const query =
    callerId === 'master_admin'
      ? db.select().from(routerProviderLogs).orderBy(desc(routerProviderLogs.createdAt)).limit(50)
      : db
          .select()
          .from(routerProviderLogs)
          .where(eq(routerProviderLogs.callerId, callerId || ''))
          .orderBy(desc(routerProviderLogs.createdAt))
          .limit(50);

  const logs = await query;
  return c.json({ success: true, data: logs });
});

/**
 * POST /api/v1/router/email/send
 */
router.post('/email/send', authRouterCallerMiddleware, blockDeviceKeyMiddleware, async (c) => {
  const db = c.get('db');
  const callerId = c.get('merchantId');
  const body = await c.req.json();
  const input = sendEmailSchema.parse(body);

  const result = await routeEmail(c.env, input, { db, callerId });
  const status = result.success ? 200 : 502;
  return c.json(result, status);
});

router.get('/email/providers', authRouterCallerMiddleware, blockDeviceKeyMiddleware, (c) => {
  return c.json({ success: true, data: getEmailProviderCapabilities(c.env) });
});

/**
 * POST /api/v1/router/sms/send
 */
router.post('/sms/send', authRouterCallerMiddleware, blockDeviceKeyMiddleware, async (c) => {
  const db = c.get('db');
  const callerId = c.get('merchantId');
  const body = await c.req.json();
  const input = sendSmsSchema.parse(body);

  const result = await routeSmsOrPush(c.env, input, { db, callerId });
  const status = result.success ? 200 : 502;
  return c.json(result, status);
});

router.get('/sms/providers', authRouterCallerMiddleware, blockDeviceKeyMiddleware, (c) => {
  return c.json({ success: true, data: getSmsProviderCapabilities(c.env) });
});

/**
 * POST /api/v1/router/image/upload
 */
router.post('/image/upload', authRouterCallerMiddleware, async (c) => {
  const db = c.get('db');
  const callerId = c.get('merchantId');
  const contentType = c.req.header('content-type') || '';

  let fileName = 'upload.png';
  let mimeType = 'image/png';
  let bytes: Uint8Array;
  let preferredProvider: 'r2' | 'imgbb' | 'supabase' | 'mongodb' | 'd1' | undefined;

  if (contentType.includes('multipart/form-data')) {
    const formData = await c.req.formData();
    const file = formData.get('file');
    if (!file || !(file instanceof File)) {
      throw new BadRequestError("Missing 'file' field in multipart/form-data upload");
    }
    fileName = file.name || 'upload.png';
    mimeType = file.type || 'image/png';
    bytes = new Uint8Array(await file.arrayBuffer());
    const pref = formData.get('preferredProvider');
    if (typeof pref === 'string' && ['r2', 'imgbb', 'supabase', 'mongodb', 'd1'].includes(pref)) {
      preferredProvider = pref as any;
    }
  } else {
    const body = await c.req.json();
    const input = imageJsonUploadSchema.parse(body);
    fileName = input.fileName;
    mimeType = input.mimeType;
    preferredProvider = input.preferredProvider;
    bytes = base64ToUint8(input.base64);
  }

  const result = await routeImageUpload(
    c.env,
    db,
    {
      fileName,
      mimeType,
      bytes,
      merchantId: callerId,
      preferredProvider,
    },
    callerId
  );

  return c.json(result, result.success ? 201 : 502);
});

router.get('/image/providers', authRouterCallerMiddleware, (c) => {
  return c.json({ success: true, data: getImageProviderCapabilities(c.env) });
});

/**
 * GET /api/v1/router/image/:id
 * Unified image loader with hardened security headers and private authorization for payment proofs.
 */
router.get('/image/:id', async (c) => {
  const db = c.get('db');
  const assetId = c.req.param('id');
  const assetMeta = await getMediaAssetRecord(db, assetId);

  const isPrivateProof = assetMeta.storageKey.startsWith('proofs/');
  if (isPrivateProof) {
    let authorized = false;
    const token = c.req.query('token')?.trim();

    if (token) {
      try {
        authorized = await verifyProofAssetToken(assetId, token, resolveJwtSecret(c.env));
      } catch {
        authorized = false;
      }
    }

    if (!authorized) {
      const hasCallerAuth = Boolean(
        c.req.header('x-admin-key') ||
          c.req.header('x-device-key') ||
          c.req.header('x-merchant-api-key') ||
          c.req.header('x-merchant-secret') ||
          c.req.header('authorization')
      );
      if (hasCallerAuth) {
        await authRouterCallerMiddleware(c, async () => {
          const callerId = c.get('merchantId');
          if (callerId === 'master_admin' || (callerId && callerId === assetMeta.merchantId)) {
            authorized = true;
          }
        });
      }
    }

    if (!authorized) {
      throw new UnauthorizedError('Valid signed token or merchant authorization is required to view payment proofs');
    }
  }

  const loaded = await routeImageDownload(c.env, db, assetId);

  return new Response(toExactArrayBuffer(loaded.bytes), {
    status: 200,
    headers: {
      'Content-Type': loaded.mimeType,
      'Content-Disposition': `inline; filename="${loaded.fileName}"`,
      'Cache-Control': isPrivateProof ? 'private, max-age=300' : 'public, max-age=86400',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox",
      'X-Orbit-Storage-Provider': loaded.providerUsed,
      'X-Orbit-Fallback-Triggered': String(loaded.fallbackTriggered),
    },
  });
});

/**
 * DELETE /api/v1/router/image/:id
 */
router.delete('/image/:id', authRouterCallerMiddleware, blockDeviceKeyMiddleware, async (c) => {
  const db = c.get('db');
  const callerId = c.get('merchantId');
  const assetId = c.req.param('id');
  const result = await routeImageDelete(c.env, db, assetId, callerId);
  return c.json({ success: true, data: result });
});

/**
 * GET /api/v1/router/database/health
 */
router.get('/database/health', authRouterCallerMiddleware, async (c) => {
  const db = c.get('db');
  const health = await checkPrimaryDatabaseHealth(c.env, db);
  return c.json({ success: true, data: health });
});

/**
 * POST /api/v1/router/database/kv
 */
router.post('/database/kv', authRouterCallerMiddleware, blockDeviceKeyMiddleware, async (c) => {
  const db = c.get('db');
  const callerId = c.get('merchantId');
  const body = await c.req.json();
  const input = kvSetSchema.parse(body);

  const result = await routeKvSet(c.env, db, scopeTenantKvKey(callerId, input.key), input.value, {
    ttlSeconds: input.ttlSeconds,
    preferredProvider: input.preferredProvider,
    callerId,
  });
  return c.json(result, result.success ? 200 : 502);
});

/**
 * GET /api/v1/router/database/kv/:key
 */
router.get('/database/kv/:key', authRouterCallerMiddleware, blockDeviceKeyMiddleware, async (c) => {
  const db = c.get('db');
  const callerId = c.get('merchantId');
  const key = c.req.param('key');
  const result = await routeKvGet(c.env, db, scopeTenantKvKey(callerId, key), { callerId });
  return c.json(result, result.success ? 200 : 404);
});

/**
 * DELETE /api/v1/router/database/kv/:key
 */
router.delete('/database/kv/:key', authRouterCallerMiddleware, blockDeviceKeyMiddleware, async (c) => {
  const db = c.get('db');
  const callerId = c.get('merchantId');
  const key = c.req.param('key');
  const result = await routeKvDelete(c.env, db, scopeTenantKvKey(callerId, key), { callerId });
  return c.json(result, result.success ? 200 : 502);
});

export default router;
