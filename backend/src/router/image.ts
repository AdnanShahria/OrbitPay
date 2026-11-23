import { eq } from 'drizzle-orm';
import type { AppDb } from '../db/client';
import { mediaAssets } from '../db/schema';
import { bufferToHex, generateSecureToken, toExactArrayBuffer } from '../shared/crypto';
import { BadRequestError, NotFoundError } from '../shared/errors';
import type { Env } from '../shared/types';
import {
  buildChannelCapabilities,
  executeWithFallback,
  resolveProviderOrder,
} from './secrets';
import type {
  ImageProviderId,
  ProviderAdapter,
  ProviderAttempt,
  ProviderCapability,
  RouterDispatchResponse,
} from './types';

export const DEFAULT_IMAGE_PROVIDERS: readonly ImageProviderId[] = [
  'r2',
  'imgbb',
  'supabase',
  'mongodb',
  'd1',
];

const ALLOWED_IMAGE_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'image/gif',
  'image/svg+xml',
]);

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // 5 MB ceiling on edge
const MAX_D1_FALLBACK_BYTES = 900 * 1024; // ~900 KB safety ceiling for D1 inline base64 rows

export interface ImageUploadInput {
  fileName: string;
  mimeType: string;
  bytes: Uint8Array;
  merchantId?: string;
  preferredProvider?: ImageProviderId;
}

export interface ImageUploadResult {
  assetId: string;
  url: string;
  externalUrl?: string | null;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  storageKey: string;
}

export interface ImageDownloadResult {
  assetId: string;
  fileName: string;
  mimeType: string;
  bytes: Uint8Array;
  providerUsed: string;
  fallbackTriggered: boolean;
  attempts: ProviderAttempt[];
}

interface StoredLocation {
  provider: ImageProviderId;
  storageKey: string;
  publicUrl?: string | null;
}

interface NormalizedImageUpload {
  assetId: string;
  storageKey: string;
  fileName: string;
  mimeType: string;
  bytes: Uint8Array;
  base64: string;
  sizeBytes: number;
  sha256: string;
  db: AppDb;
}

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

export function base64ToUint8(base64: string): Uint8Array {
  const clean = base64.includes(',') ? base64.split(',')[1] : base64;
  const binary = atob(clean);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function computeSha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', toExactArrayBuffer(bytes));
  return bufferToHex(digest);
}

function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120) || 'upload.png';
}

const IMAGE_UPLOAD_ADAPTERS: Record<
  string,
  ProviderAdapter<NormalizedImageUpload, StoredLocation>
> = {
  r2: {
    id: 'r2',
    isConfigured: (env) => Boolean(env.R2_BUCKET),
    execute: async (env, input) => {
      await env.R2_BUCKET!.put(input.storageKey, input.bytes, {
        httpMetadata: { contentType: input.mimeType },
        customMetadata: {
          assetId: input.assetId,
          sha256: input.sha256,
        },
      });

      return {
        ok: true,
        statusCode: 200,
        data: {
          provider: 'r2',
          storageKey: input.storageKey,
          publicUrl: null,
        },
      };
    },
  },

  imgbb: {
    id: 'imgbb',
    isConfigured: (env) => Boolean(env.IMGBB_API_KEY),
    execute: async (env, input) => {
      const form = new FormData();
      form.append('image', input.base64);
      form.append('name', input.assetId);

      const res = await fetch(
        `https://api.imgbb.com/1/upload?key=${encodeURIComponent(env.IMGBB_API_KEY!)}`,
        {
          method: 'POST',
          body: form,
          signal: AbortSignal.timeout(15000),
        }
      );

      if (!res.ok) {
        return {
          ok: false,
          statusCode: res.status,
          error: (await res.text().catch(() => res.statusText)).slice(0, 300),
        };
      }

      const json = (await res.json()) as {
        success?: boolean;
        data?: { id?: string; url?: string; display_url?: string };
        error?: { message?: string };
      };

      if (!json.success || !json.data?.url) {
        return {
          ok: false,
          statusCode: 502,
          error: json.error?.message || 'ImgBB upload returned invalid payload',
        };
      }

      return {
        ok: true,
        statusCode: 200,
        data: {
          provider: 'imgbb',
          storageKey: json.data.id || input.assetId,
          publicUrl: json.data.url || json.data.display_url || null,
        },
      };
    },
  },

  supabase: {
    id: 'supabase',
    isConfigured: (env) => Boolean(env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY),
    execute: async (env, input) => {
      const baseUrl = env.SUPABASE_URL!.replace(/\/$/, '');
      const bucket = env.SUPABASE_STORAGE_BUCKET || 'orbit-media';
      const uploadUrl = `${baseUrl}/storage/v1/object/${bucket}/${input.storageKey}`;

      const res = await fetch(uploadUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
          apikey: env.SUPABASE_SERVICE_ROLE_KEY!,
          'Content-Type': input.mimeType,
          'x-upsert': 'true',
        },
        body: toExactArrayBuffer(input.bytes),
        signal: AbortSignal.timeout(15000),
      });

      if (!res.ok) {
        return {
          ok: false,
          statusCode: res.status,
          error: (await res.text().catch(() => res.statusText)).slice(0, 300),
        };
      }

      return {
        ok: true,
        statusCode: res.status,
        data: {
          provider: 'supabase',
          storageKey: input.storageKey,
          publicUrl: `${baseUrl}/storage/v1/object/public/${bucket}/${input.storageKey}`,
        },
      };
    },
  },

  mongodb: {
    id: 'mongodb',
    isConfigured: (env) => Boolean(env.MONGODB_DATA_API_URL && env.MONGODB_API_KEY),
    execute: async (env, input) => {
      const endpoint = `${env.MONGODB_DATA_API_URL!.replace(/\/$/, '')}/action/insertOne`;
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'api-key': env.MONGODB_API_KEY!,
        },
        body: JSON.stringify({
          dataSource: 'Cluster0',
          database: env.MONGODB_DATABASE || 'orbit_payment',
          collection: 'orbit_media',
          document: {
            _id: input.assetId,
            storageKey: input.storageKey,
            fileName: input.fileName,
            mimeType: input.mimeType,
            sizeBytes: input.sizeBytes,
            sha256: input.sha256,
            dataBase64: input.base64,
            createdAt: new Date().toISOString(),
          },
        }),
        signal: AbortSignal.timeout(12000),
      });

      if (!res.ok) {
        return {
          ok: false,
          statusCode: res.status,
          error: (await res.text().catch(() => res.statusText)).slice(0, 300),
        };
      }

      return {
        ok: true,
        statusCode: res.status,
        data: {
          provider: 'mongodb',
          storageKey: input.assetId,
          publicUrl: null,
        },
      };
    },
  },

  d1: {
    id: 'd1',
    isConfigured: (env) => Boolean(env.DB),
    execute: async (_env, input) => {
      if (input.sizeBytes > MAX_D1_FALLBACK_BYTES) {
        return {
          ok: false,
          statusCode: 413,
          error: `Image exceeds D1 fallback inline size limit (${MAX_D1_FALLBACK_BYTES} bytes)`,
        };
      }
      return {
        ok: true,
        statusCode: 200,
        data: {
          provider: 'd1',
          storageKey: input.assetId,
          publicUrl: null,
        },
      };
    },
  },
};

/**
 * Unified Image Upload Router
 * Validates image safety on the backend and routes uploads through configured storage backends:
 * R2 -> ImgBB -> Supabase -> MongoDB -> D1.
 */
export async function routeImageUpload(
  env: Env,
  db: AppDb,
  input: ImageUploadInput,
  callerId?: string
): Promise<RouterDispatchResponse<ImageUploadResult>> {
  const mimeType = input.mimeType.toLowerCase().trim();
  if (!ALLOWED_IMAGE_MIME_TYPES.has(mimeType)) {
    throw new BadRequestError(`Unsupported image MIME type '${mimeType}'`);
  }

  if (input.bytes.byteLength === 0 || input.bytes.byteLength > MAX_UPLOAD_BYTES) {
    throw new BadRequestError(`Image size must be between 1 byte and ${MAX_UPLOAD_BYTES} bytes`);
  }

  const assetId = `img_${generateSecureToken(16)}`;
  const cleanName = sanitizeFileName(input.fileName);
  const storageKey = `assets/${assetId}_${cleanName}`;
  const sha256 = await computeSha256Hex(input.bytes);
  const base64 = uint8ToBase64(input.bytes);

  const normalized: NormalizedImageUpload = {
    assetId,
    storageKey,
    fileName: cleanName,
    mimeType,
    bytes: input.bytes,
    base64,
    sizeBytes: input.bytes.byteLength,
    sha256,
    db,
  };

  const priorityOrder = resolveProviderOrder(
    env.IMAGE_PROVIDER_ORDER,
    DEFAULT_IMAGE_PROVIDERS,
    input.preferredProvider
  );

  const dispatch = await executeWithFallback({
    channel: 'image',
    env,
    input: normalized,
    adapters: IMAGE_UPLOAD_ADAPTERS,
    priorityOrder,
    db,
    callerId,
  });

  if (!dispatch.success || !dispatch.data) {
    return {
      success: false,
      channel: 'image',
      providerUsed: null,
      fallbackTriggered: dispatch.fallbackTriggered,
      attempts: dispatch.attempts,
      error: dispatch.error,
    };
  }

  const stored = dispatch.data;
  const fallbackLocations: StoredLocation[] = [stored];

  await db.insert(mediaAssets).values({
    id: assetId,
    merchantId: input.merchantId || null,
    fileName: cleanName,
    mimeType,
    sizeBytes: input.bytes.byteLength,
    sha256,
    primaryProvider: stored.provider,
    storageKey: stored.storageKey,
    publicUrl: stored.publicUrl || null,
    fallbackLocationsJson: JSON.stringify(fallbackLocations),
    dataBase64: stored.provider === 'd1' ? base64 : null,
  });

  return {
    success: true,
    channel: 'image',
    providerUsed: stored.provider,
    fallbackTriggered: dispatch.fallbackTriggered,
    attempts: dispatch.attempts,
    data: {
      assetId,
      url: `/api/v1/router/image/${assetId}`,
      externalUrl: stored.publicUrl || null,
      fileName: cleanName,
      mimeType,
      sizeBytes: input.bytes.byteLength,
      sha256,
      storageKey: stored.storageKey,
    },
  };
}

async function fetchLocationBytes(
  env: Env,
  asset: typeof mediaAssets.$inferSelect,
  loc: StoredLocation
): Promise<Uint8Array | null> {
  if (loc.provider === 'r2' && env.R2_BUCKET) {
    const obj = await env.R2_BUCKET.get(loc.storageKey);
    if (!obj) return null;
    return new Uint8Array(await obj.arrayBuffer());
  }

  if (loc.provider === 'supabase' && env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY) {
    const baseUrl = env.SUPABASE_URL.replace(/\/$/, '');
    const bucket = env.SUPABASE_STORAGE_BUCKET || 'orbit-media';
    const res = await fetch(`${baseUrl}/storage/v1/object/${bucket}/${loc.storageKey}`, {
      headers: {
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    return new Uint8Array(await res.arrayBuffer());
  }

  if (loc.provider === 'imgbb' && loc.publicUrl) {
    const res = await fetch(loc.publicUrl, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return null;
    return new Uint8Array(await res.arrayBuffer());
  }

  if (loc.provider === 'mongodb' && env.MONGODB_DATA_API_URL && env.MONGODB_API_KEY) {
    const endpoint = `${env.MONGODB_DATA_API_URL.replace(/\/$/, '')}/action/findOne`;
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': env.MONGODB_API_KEY,
      },
      body: JSON.stringify({
        dataSource: 'Cluster0',
        database: env.MONGODB_DATABASE || 'orbit_payment',
        collection: 'orbit_media',
        filter: { _id: asset.id },
      }),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { document?: { dataBase64?: string } };
    if (!json.document?.dataBase64) return null;
    return base64ToUint8(json.document.dataBase64);
  }

  if (loc.provider === 'd1' && asset.dataBase64) {
    return base64ToUint8(asset.dataBase64);
  }

  return null;
}

/**
 * Unified Image Download Router
 * Resolves an opaque asset ID from the D1 registry and loads bytes from the primary
 * backend, cascading across fallback locations (and inline D1 blob) if primary fails.
 */
export async function routeImageDownload(
  env: Env,
  db: AppDb,
  assetId: string
): Promise<ImageDownloadResult> {
  const rows = await db.select().from(mediaAssets).where(eq(mediaAssets.id, assetId)).limit(1);
  const asset = rows[0];
  if (!asset) {
    throw new NotFoundError(`Image asset '${assetId}' not found`);
  }

  const locations: StoredLocation[] = [];
  locations.push({
    provider: asset.primaryProvider as ImageProviderId,
    storageKey: asset.storageKey,
    publicUrl: asset.publicUrl,
  });

  if (asset.fallbackLocationsJson) {
    try {
      const parsed = JSON.parse(asset.fallbackLocationsJson) as StoredLocation[];
      for (const loc of parsed) {
        if (!locations.some((existing) => existing.provider === loc.provider)) {
          locations.push(loc);
        }
      }
    } catch {
      // Ignore malformed JSON
    }
  }

  if (asset.dataBase64 && !locations.some((loc) => loc.provider === 'd1')) {
    locations.push({ provider: 'd1', storageKey: asset.id, publicUrl: null });
  }

  const attempts: ProviderAttempt[] = [];
  for (let i = 0; i < locations.length; i++) {
    const loc = locations[i];
    const started = Date.now();
    try {
      const bytes = await fetchLocationBytes(env, asset, loc);
      const latencyMs = Date.now() - started;
      if (bytes && bytes.byteLength > 0) {
        attempts.push({ provider: loc.provider, ok: true, statusCode: 200, latencyMs });
        return {
          assetId: asset.id,
          fileName: asset.fileName,
          mimeType: asset.mimeType,
          bytes,
          providerUsed: loc.provider,
          fallbackTriggered: i > 0,
          attempts,
        };
      }
      attempts.push({
        provider: loc.provider,
        ok: false,
        statusCode: 404,
        error: 'Asset bytes unavailable from provider',
        latencyMs,
      });
    } catch (err: any) {
      attempts.push({
        provider: loc.provider,
        ok: false,
        error: err?.message || 'Fetch error',
        latencyMs: Date.now() - started,
      });
    }
  }

  throw new NotFoundError(`Unable to load image bytes for '${assetId}' from any configured storage backend`);
}

export async function routeImageDelete(
  env: Env,
  db: AppDb,
  assetId: string
): Promise<{ deleted: boolean; assetId: string }> {
  const rows = await db.select().from(mediaAssets).where(eq(mediaAssets.id, assetId)).limit(1);
  const asset = rows[0];
  if (!asset) {
    throw new NotFoundError(`Image asset '${assetId}' not found`);
  }

  if (asset.primaryProvider === 'r2' && env.R2_BUCKET) {
    await env.R2_BUCKET.delete(asset.storageKey).catch(() => {});
  }

  if (asset.primaryProvider === 'supabase' && env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY) {
    const baseUrl = env.SUPABASE_URL.replace(/\/$/, '');
    const bucket = env.SUPABASE_STORAGE_BUCKET || 'orbit-media';
    await fetch(`${baseUrl}/storage/v1/object/${bucket}/${asset.storageKey}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      },
    }).catch(() => {});
  }

  await db.delete(mediaAssets).where(eq(mediaAssets.id, assetId));
  return { deleted: true, assetId };
}

export function getImageProviderCapabilities(env: Env): ProviderCapability[] {
  const order = resolveProviderOrder(env.IMAGE_PROVIDER_ORDER, DEFAULT_IMAGE_PROVIDERS);
  return buildChannelCapabilities('image', env, IMAGE_UPLOAD_ADAPTERS, order);
}
