import { and, desc, eq } from 'drizzle-orm';
import type { AppDb } from '../../db/client';
import { appReleases, merchants, type AppReleaseRecord } from '../../db/schema';
import { bufferToHex, generateSecureToken } from '../../shared/crypto';
import { AppError, ConflictError, NotFoundError, ValidationError } from '../../shared/errors';
import type { Env } from '../../shared/types';
import { sendPushToMerchantDevicesDetailed } from '../webhooks/webhook.dispatcher';

export interface SerializedAppRelease {
  id: string;
  platform: string;
  versionCode: number;
  versionName: string;
  minSupportedVersionCode: number;
  mandatory: boolean;
  releaseNotes: string;
  fileName: string;
  sha256: string;
  sizeBytes: number;
  isActive: boolean;
  downloadUrl: string;
  createdAt: string;
}

export interface LatestReleaseResponse {
  hasRelease: boolean;
  updateAvailable: boolean;
  forceUpdate: boolean;
  release: SerializedAppRelease | null;
}

export interface BroadcastSummary {
  merchantsTargeted: number;
  totalDelivered: number;
  wsDelivered: number;
  fcmDelivered: number;
}

export interface PublishReleaseInput {
  fileName: string;
  bytes: ArrayBuffer;
  versionCode: number;
  versionName: string;
  minSupportedVersionCode: number;
  mandatory: boolean;
  releaseNotes: string;
  notifyDevices: boolean;
}

export function sanitizeApkFileName(rawName: string, versionName: string): string {
  const base = rawName.trim().split(/[/\\]/).pop() || '';
  const cleaned = base.replace(/[^a-zA-Z0-9._-]/g, '_');
  if (cleaned.toLowerCase().endsWith('.apk') && cleaned.length > 4) {
    return cleaned;
  }
  const safeVersion = versionName.trim().replace(/[^a-zA-Z0-9._-]/g, '_') || 'latest';
  return `orbit-pay-v${safeVersion}.apk`;
}

export function serializeRelease(row: AppReleaseRecord, origin: string): SerializedAppRelease {
  const normalizedOrigin = origin.replace(/\/+$/, '');
  return {
    id: row.id,
    platform: row.platform,
    versionCode: row.versionCode,
    versionName: row.versionName,
    minSupportedVersionCode: row.minSupportedVersionCode,
    mandatory: row.mandatory,
    releaseNotes: row.releaseNotes,
    fileName: row.fileName,
    sha256: row.sha256,
    sizeBytes: row.sizeBytes,
    isActive: row.isActive,
    downloadUrl: `${normalizedOrigin}/api/v1/app/download/${row.id}`,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function getLatestRelease(
  db: AppDb,
  origin: string,
  currentVersionCode?: number,
  platform = 'ANDROID'
): Promise<LatestReleaseResponse> {
  const rows = await db
    .select()
    .from(appReleases)
    .where(and(eq(appReleases.platform, platform), eq(appReleases.isActive, true)))
    .orderBy(desc(appReleases.versionCode))
    .limit(1);

  const latest = rows[0];
  if (!latest) {
    return {
      hasRelease: false,
      updateAvailable: false,
      forceUpdate: false,
      release: null,
    };
  }

  const updateAvailable =
    currentVersionCode !== undefined ? latest.versionCode > currentVersionCode : true;
  const forceUpdate =
    currentVersionCode !== undefined
      ? (latest.mandatory && latest.versionCode > currentVersionCode) ||
        currentVersionCode < latest.minSupportedVersionCode
      : latest.mandatory;

  return {
    hasRelease: true,
    updateAvailable,
    forceUpdate,
    release: serializeRelease(latest, origin),
  };
}

export async function listReleases(
  db: AppDb,
  origin: string
): Promise<SerializedAppRelease[]> {
  const rows = await db
    .select()
    .from(appReleases)
    .orderBy(desc(appReleases.versionCode));

  return rows.map((row) => serializeRelease(row, origin));
}

export async function getReleaseByIdOrLatest(
  db: AppDb,
  idOrLatest: string
): Promise<AppReleaseRecord> {
  if (idOrLatest === 'latest') {
    const rows = await db
      .select()
      .from(appReleases)
      .where(and(eq(appReleases.platform, 'ANDROID'), eq(appReleases.isActive, true)))
      .orderBy(desc(appReleases.versionCode))
      .limit(1);

    if (!rows[0]) {
      throw new NotFoundError('No active Android release found');
    }
    return rows[0];
  }

  const rows = await db
    .select()
    .from(appReleases)
    .where(eq(appReleases.id, idOrLatest))
    .limit(1);

  if (!rows[0]) {
    throw new NotFoundError(`Release '${idOrLatest}' not found`);
  }
  return rows[0];
}

export async function broadcastAppUpdate(
  db: AppDb,
  env: Env,
  release: AppReleaseRecord,
  origin: string
): Promise<BroadcastSummary> {
  const activeMerchants = await db
    .select()
    .from(merchants)
    .where(eq(merchants.isActive, true));

  const normalizedOrigin = origin.replace(/\/+$/, '');
  const title = `ORBIT Pay v${release.versionName} Available`;
  const body = release.mandatory
    ? `Required update v${release.versionName} is ready to install.`
    : release.releaseNotes.trim() ||
      `ORBIT Pay v${release.versionName} is ready to download and install.`;

  const data: Record<string, string> = {
    event: 'app.update_available',
    releaseId: release.id,
    versionCode: String(release.versionCode),
    versionName: release.versionName,
    minSupportedVersionCode: String(release.minSupportedVersionCode),
    mandatory: String(release.mandatory),
    sha256: release.sha256,
    downloadUrl: `${normalizedOrigin}/api/v1/app/download/${release.id}`,
    releaseNotes: release.releaseNotes,
  };

  let totalDelivered = 0;
  let wsDelivered = 0;
  let fcmDelivered = 0;

  const settled = await Promise.allSettled(
    activeMerchants.map((merchant) =>
      sendPushToMerchantDevicesDetailed(db, env, merchant, title, body, data)
    )
  );

  for (const res of settled) {
    if (res.status === 'fulfilled') {
      totalDelivered += res.value.totalDelivered;
      wsDelivered += res.value.wsDelivered;
      fcmDelivered += res.value.fcmDelivered;
    }
  }

  return {
    merchantsTargeted: activeMerchants.length,
    totalDelivered,
    wsDelivered,
    fcmDelivered,
  };
}

export async function publishRelease(
  db: AppDb,
  env: Env,
  origin: string,
  input: PublishReleaseInput
): Promise<{ release: SerializedAppRelease; broadcast?: BroadcastSummary }> {
  if (!env.R2_BUCKET) {
    throw new AppError(
      'Cloudflare R2 bucket binding (R2_BUCKET) is not configured',
      503,
      'R2_NOT_BOUND'
    );
  }

  const platform = 'ANDROID';
  const existing = await db
    .select({ id: appReleases.id })
    .from(appReleases)
    .where(
      and(
        eq(appReleases.platform, platform),
        eq(appReleases.versionCode, input.versionCode)
      )
    )
    .limit(1);

  if (existing[0]) {
    throw new ConflictError(
      `An Android release with versionCode ${input.versionCode} already exists`
    );
  }

  if (input.minSupportedVersionCode > input.versionCode) {
    throw new ValidationError(
      'minSupportedVersionCode cannot exceed versionCode'
    );
  }

  const id = `rel_${generateSecureToken(12)}`;
  const fileName = sanitizeApkFileName(input.fileName, input.versionName);
  const r2Key = `releases/android/v${input.versionCode}-${id}.apk`;

  const digest = await crypto.subtle.digest('SHA-256', input.bytes);
  const sha256 = bufferToHex(digest);
  const sizeBytes = input.bytes.byteLength;

  await env.R2_BUCKET.put(r2Key, input.bytes, {
    httpMetadata: {
      contentType: 'application/vnd.android.package-archive',
    },
    customMetadata: {
      releaseId: id,
      versionCode: String(input.versionCode),
      versionName: input.versionName,
      sha256,
    },
  });

  const now = new Date();
  try {
    await db.insert(appReleases).values({
      id,
      platform,
      versionCode: input.versionCode,
      versionName: input.versionName.trim(),
      minSupportedVersionCode: input.minSupportedVersionCode,
      mandatory: input.mandatory,
      releaseNotes: input.releaseNotes.trim(),
      fileName,
      r2Key,
      sha256,
      sizeBytes,
      isActive: true,
      createdAt: now,
    });
  } catch (err) {
    await env.R2_BUCKET.delete(r2Key).catch(() => {});
    throw err;
  }

  const createdRows = await db
    .select()
    .from(appReleases)
    .where(eq(appReleases.id, id))
    .limit(1);

  const created = createdRows[0];
  if (!created) {
    throw new AppError('Failed to retrieve created release record', 500, 'RELEASE_CREATE_FAILED');
  }

  let broadcast: BroadcastSummary | undefined;
  if (input.notifyDevices) {
    broadcast = await broadcastAppUpdate(db, env, created, origin);
  }

  return {
    release: serializeRelease(created, origin),
    broadcast,
  };
}

export async function updateReleaseMetadata(
  db: AppDb,
  origin: string,
  id: string,
  patch: {
    mandatory?: boolean;
    minSupportedVersionCode?: number;
    releaseNotes?: string;
    isActive?: boolean;
  }
): Promise<SerializedAppRelease> {
  const existing = await getReleaseByIdOrLatest(db, id);

  const nextMinSupported =
    patch.minSupportedVersionCode ?? existing.minSupportedVersionCode;
  if (nextMinSupported > existing.versionCode) {
    throw new ValidationError('minSupportedVersionCode cannot exceed versionCode');
  }

  await db
    .update(appReleases)
    .set({
      mandatory: patch.mandatory ?? existing.mandatory,
      minSupportedVersionCode: nextMinSupported,
      releaseNotes:
        patch.releaseNotes !== undefined ? patch.releaseNotes.trim() : existing.releaseNotes,
      isActive: patch.isActive ?? existing.isActive,
    })
    .where(eq(appReleases.id, existing.id));

  const updated = await getReleaseByIdOrLatest(db, existing.id);
  return serializeRelease(updated, origin);
}

export async function deleteRelease(
  db: AppDb,
  env: Env,
  id: string
): Promise<{ id: string; deleted: boolean }> {
  const existing = await getReleaseByIdOrLatest(db, id);

  if (env.R2_BUCKET) {
    await env.R2_BUCKET.delete(existing.r2Key).catch(() => {});
  }

  await db.delete(appReleases).where(eq(appReleases.id, existing.id));
  return { id: existing.id, deleted: true };
}
