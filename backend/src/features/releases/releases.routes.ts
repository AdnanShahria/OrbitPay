import { Hono } from 'hono';
import { z } from 'zod';
import { AppError, NotFoundError, ValidationError } from '../../shared/errors';
import { authMasterAdminMiddleware } from '../../shared/middleware';
import type { AppContextEnv } from '../../shared/types';
import {
  broadcastAppUpdate,
  deleteRelease,
  getLatestRelease,
  getReleaseByIdOrLatest,
  listReleases,
  publishRelease,
  updateReleaseMetadata,
} from './releases.service';

const MAX_APK_BYTES = 100 * 1024 * 1024; // 100 MB

const latestQuerySchema = z.object({
  currentVersionCode: z.preprocess(
    (val) => (val === '' || val === undefined || val === null ? undefined : val),
    z.coerce.number().int().positive().optional()
  ),
  platform: z.enum(['ANDROID']).optional().default('ANDROID'),
});

const patchReleaseSchema = z.object({
  mandatory: z.boolean().optional(),
  minSupportedVersionCode: z.number().int().positive().optional(),
  releaseNotes: z.string().max(4000).optional(),
  isActive: z.boolean().optional(),
});

function resolveOrigin(requestUrl: string, productionDomain?: string): string {
  const parsed = new URL(requestUrl);
  if (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') {
    return parsed.origin;
  }
  if (productionDomain?.trim()) {
    const clean = productionDomain.trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '');
    return `https://${clean}`;
  }
  return parsed.origin;
}

export const appPublicRoutes = new Hono<AppContextEnv>();

/**
 * GET /api/v1/app/latest
 * Returns the latest active Android release manifest and update/force-update flags.
 */
appPublicRoutes.get('/latest', async (c) => {
  const db = c.get('db');
  const query = latestQuerySchema.parse(c.req.query());
  const origin = resolveOrigin(c.req.url, c.env.PRODUCTION_DOMAIN);

  const data = await getLatestRelease(
    db,
    origin,
    query.currentVersionCode,
    query.platform
  );

  return c.json({ success: true, data });
});

/**
 * GET /api/v1/app/download/:id
 * Streams the signed APK binary directly from Cloudflare R2 (`R2_BUCKET`).
 */
appPublicRoutes.get('/download/:id', async (c) => {
  if (!c.env.R2_BUCKET) {
    throw new AppError(
      'Cloudflare R2 bucket binding (R2_BUCKET) is not configured',
      503,
      'R2_NOT_BOUND'
    );
  }

  const db = c.get('db');
  const idOrLatest = c.req.param('id');
  const release = await getReleaseByIdOrLatest(db, idOrLatest);

  if (!release.isActive && idOrLatest !== 'latest') {
    throw new NotFoundError(`Release '${idOrLatest}' is inactive`);
  }

  const object = await c.env.R2_BUCKET.get(release.r2Key);
  if (!object || !object.body) {
    throw new NotFoundError(`APK binary missing from R2 storage for release '${release.id}'`);
  }

  const headers = new Headers();
  headers.set('Content-Type', 'application/vnd.android.package-archive');
  headers.set('Content-Disposition', `attachment; filename="${release.fileName}"`);
  headers.set('Content-Length', String(object.size));
  headers.set('X-APK-SHA256', release.sha256);
  headers.set('Cache-Control', 'public, max-age=3600');

  return new Response(object.body, {
    status: 200,
    headers,
  });
});

export const adminReleasesRoutes = new Hono<AppContextEnv>();
adminReleasesRoutes.use('*', authMasterAdminMiddleware);

/**
 * GET /api/v1/admin/releases
 * Lists all published app releases and R2 storage readiness.
 */
adminReleasesRoutes.get('/', async (c) => {
  const db = c.get('db');
  const origin = resolveOrigin(c.req.url, c.env.PRODUCTION_DOMAIN);
  const releases = await listReleases(db, origin);

  return c.json({
    success: true,
    data: {
      r2Configured: Boolean(c.env.R2_BUCKET),
      releases,
    },
  });
});

/**
 * POST /api/v1/admin/releases
 * Uploads an Android APK to Cloudflare R2, records metadata + SHA-256 in D1,
 * and optionally broadcasts `app.update_available` across connected devices.
 */
adminReleasesRoutes.post('/', async (c) => {
  const db = c.get('db');
  const formData = await c.req.formData().catch(() => {
    throw new ValidationError('Expected multipart/form-data payload with APK file');
  });

  const fileEntry = formData.get('apk');
  if (!fileEntry || typeof fileEntry === 'string') {
    throw new ValidationError('Missing APK file field ("apk")');
  }

  const apkFile = fileEntry as File;
  if (!apkFile.name.toLowerCase().endsWith('.apk')) {
    throw new ValidationError('Uploaded file must have a .apk extension');
  }
  if (apkFile.size <= 0) {
    throw new ValidationError('Uploaded APK file is empty');
  }
  if (apkFile.size > MAX_APK_BYTES) {
    throw new ValidationError('APK file exceeds the 100 MB upload limit');
  }

  const versionCodeRaw = String(formData.get('versionCode') ?? '').trim();
  const versionNameRaw = String(formData.get('versionName') ?? '').trim();
  const minSupportedRaw = String(formData.get('minSupportedVersionCode') ?? '').trim();
  const mandatoryRaw = String(formData.get('mandatory') ?? 'false').trim().toLowerCase();
  const releaseNotesRaw = String(formData.get('releaseNotes') ?? '');
  const notifyRaw = String(formData.get('notifyDevices') ?? 'true').trim().toLowerCase();

  const versionCode = Number.parseInt(versionCodeRaw, 10);
  if (!Number.isInteger(versionCode) || versionCode < 1) {
    throw new ValidationError('versionCode must be a positive integer');
  }
  if (!versionNameRaw || versionNameRaw.length > 64) {
    throw new ValidationError('versionName is required (max 64 chars)');
  }

  const minSupportedVersionCode = minSupportedRaw
    ? Number.parseInt(minSupportedRaw, 10)
    : 1;
  if (!Number.isInteger(minSupportedVersionCode) || minSupportedVersionCode < 1) {
    throw new ValidationError('minSupportedVersionCode must be a positive integer');
  }

  const mandatory = mandatoryRaw === 'true' || mandatoryRaw === '1' || mandatoryRaw === 'on';
  const notifyDevices = notifyRaw !== 'false' && notifyRaw !== '0';

  const bytes = await apkFile.arrayBuffer();
  const origin = resolveOrigin(c.req.url, c.env.PRODUCTION_DOMAIN);

  const result = await publishRelease(db, c.env, origin, {
    fileName: apkFile.name,
    bytes,
    versionCode,
    versionName: versionNameRaw,
    minSupportedVersionCode,
    mandatory,
    releaseNotes: releaseNotesRaw,
    notifyDevices,
  });

  return c.json({ success: true, data: result }, 201);
});

/**
 * POST /api/v1/admin/releases/:id/broadcast
 * Sends an instant `app.update_available` WebSocket + FCM push to all active merchants.
 */
adminReleasesRoutes.post('/:id/broadcast', async (c) => {
  const db = c.get('db');
  const id = c.req.param('id');
  const origin = resolveOrigin(c.req.url, c.env.PRODUCTION_DOMAIN);
  const release = await getReleaseByIdOrLatest(db, id);

  const summary = await broadcastAppUpdate(db, c.env, release, origin);
  return c.json({ success: true, data: summary });
});

/**
 * PATCH /api/v1/admin/releases/:id
 * Updates release mandatory flag, minimum supported version, notes, or active status.
 */
adminReleasesRoutes.patch('/:id', async (c) => {
  const db = c.get('db');
  const id = c.req.param('id');
  const body = await c.req.json();
  const patch = patchReleaseSchema.parse(body);
  const origin = resolveOrigin(c.req.url, c.env.PRODUCTION_DOMAIN);

  const updated = await updateReleaseMetadata(db, origin, id, patch);
  return c.json({ success: true, data: updated });
});

/**
 * DELETE /api/v1/admin/releases/:id
 * Deletes a release metadata row and its backing APK object in R2.
 */
adminReleasesRoutes.delete('/:id', async (c) => {
  const db = c.get('db');
  const id = c.req.param('id');
  const result = await deleteRelease(db, c.env, id);
  return c.json({ success: true, data: result });
});
