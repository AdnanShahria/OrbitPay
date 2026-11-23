import { eq, sql } from 'drizzle-orm';
import type { AppDb } from '../db/client';
import { routerKvStore } from '../db/schema';
import type { Env } from '../shared/types';
import {
  buildChannelCapabilities,
  executeWithFallback,
  resolveProviderOrder,
} from './secrets';
import type {
  DatabaseProviderId,
  ProviderAdapter,
  ProviderCapability,
  RouterDispatchResponse,
} from './types';

export const DEFAULT_DATABASE_PROVIDERS: readonly DatabaseProviderId[] = [
  'kv',
  'd1',
  'supabase',
  'mongodb',
  'turso',
];

interface KvOperationInput {
  op: 'get' | 'set' | 'delete';
  key: string;
  value?: unknown;
  ttlSeconds?: number;
  db: AppDb;
}

interface KvOperationOutput {
  found: boolean;
  key: string;
  value?: unknown;
}

const KV_STORAGE_ADAPTERS: Record<
  string,
  ProviderAdapter<KvOperationInput, KvOperationOutput>
> = {
  kv: {
    id: 'kv',
    isConfigured: (env) => Boolean(env.KV),
    execute: async (env, input) => {
      if (input.op === 'get') {
        const raw = await env.KV!.get(input.key);
        if (raw === null) {
          return { ok: false, statusCode: 404, error: 'Key not found in KV' };
        }
        return {
          ok: true,
          statusCode: 200,
          data: { found: true, key: input.key, value: JSON.parse(raw) },
        };
      }

      if (input.op === 'set') {
        const serialized = JSON.stringify(input.value ?? null);
        await env.KV!.put(input.key, serialized, {
          expirationTtl: input.ttlSeconds && input.ttlSeconds >= 60 ? input.ttlSeconds : undefined,
        });
        return {
          ok: true,
          statusCode: 200,
          data: { found: true, key: input.key, value: input.value },
        };
      }

      await env.KV!.delete(input.key);
      return {
        ok: true,
        statusCode: 200,
        data: { found: false, key: input.key },
      };
    },
  },

  d1: {
    id: 'd1',
    isConfigured: (env) => Boolean(env.DB),
    execute: async (_env, input) => {
      if (input.op === 'get') {
        const rows = await input.db
          .select()
          .from(routerKvStore)
          .where(eq(routerKvStore.key, input.key))
          .limit(1);
        const row = rows[0];
        if (!row) {
          return { ok: false, statusCode: 404, error: 'Key not found in D1 router_kv_store' };
        }
        if (row.expiresAt && row.expiresAt.getTime() < Date.now()) {
          await input.db.delete(routerKvStore).where(eq(routerKvStore.key, input.key));
          return { ok: false, statusCode: 404, error: 'Key expired in D1 router_kv_store' };
        }
        return {
          ok: true,
          statusCode: 200,
          data: { found: true, key: input.key, value: JSON.parse(row.valueJson) },
        };
      }

      if (input.op === 'set') {
        const serialized = JSON.stringify(input.value ?? null);
        const expiresAt = input.ttlSeconds ? new Date(Date.now() + input.ttlSeconds * 1000) : null;
        const now = new Date();
        await input.db
          .insert(routerKvStore)
          .values({
            key: input.key,
            valueJson: serialized,
            expiresAt,
            updatedAt: now,
          })
          .onConflictDoUpdate({
            target: routerKvStore.key,
            set: {
              valueJson: serialized,
              expiresAt,
              updatedAt: now,
            },
          });
        return {
          ok: true,
          statusCode: 200,
          data: { found: true, key: input.key, value: input.value },
        };
      }

      await input.db.delete(routerKvStore).where(eq(routerKvStore.key, input.key));
      return { ok: true, statusCode: 200, data: { found: false, key: input.key } };
    },
  },

  supabase: {
    id: 'supabase',
    isConfigured: (env) => Boolean(env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY),
    execute: async (env, input) => {
      const baseUrl = env.SUPABASE_URL!.replace(/\/$/, '');
      const headers = {
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        apikey: env.SUPABASE_SERVICE_ROLE_KEY!,
        'Content-Type': 'application/json',
      };

      if (input.op === 'get') {
        const res = await fetch(
          `${baseUrl}/rest/v1/router_kv_store?key=eq.${encodeURIComponent(input.key)}&select=value_json`,
          { headers, signal: AbortSignal.timeout(8000) }
        );
        if (!res.ok) {
          return { ok: false, statusCode: res.status, error: await res.text().catch(() => res.statusText) };
        }
        const rows = (await res.json()) as Array<{ value_json?: string }>;
        if (!rows[0]) {
          return { ok: false, statusCode: 404, error: 'Key not found in Supabase' };
        }
        return {
          ok: true,
          statusCode: 200,
          data: {
            found: true,
            key: input.key,
            value: rows[0].value_json ? JSON.parse(rows[0].value_json) : null,
          },
        };
      }

      if (input.op === 'set') {
        const res = await fetch(`${baseUrl}/rest/v1/router_kv_store`, {
          method: 'POST',
          headers: { ...headers, Prefer: 'resolution=merge-duplicates' },
          body: JSON.stringify({
            key: input.key,
            value_json: JSON.stringify(input.value ?? null),
            updated_at: new Date().toISOString(),
          }),
          signal: AbortSignal.timeout(8000),
        });
        if (!res.ok) {
          return { ok: false, statusCode: res.status, error: await res.text().catch(() => res.statusText) };
        }
        return { ok: true, statusCode: res.status, data: { found: true, key: input.key, value: input.value } };
      }

      const res = await fetch(
        `${baseUrl}/rest/v1/router_kv_store?key=eq.${encodeURIComponent(input.key)}`,
        { method: 'DELETE', headers, signal: AbortSignal.timeout(8000) }
      );
      if (!res.ok) {
        return { ok: false, statusCode: res.status, error: await res.text().catch(() => res.statusText) };
      }
      return { ok: true, statusCode: res.status, data: { found: false, key: input.key } };
    },
  },

  mongodb: {
    id: 'mongodb',
    isConfigured: (env) => Boolean(env.MONGODB_DATA_API_URL && env.MONGODB_API_KEY),
    execute: async (env, input) => {
      const base = env.MONGODB_DATA_API_URL!.replace(/\/$/, '');
      const common = {
        dataSource: 'Cluster0',
        database: env.MONGODB_DATABASE || 'orbit_payment',
        collection: 'router_kv_store',
      };
      const headers = {
        'Content-Type': 'application/json',
        'api-key': env.MONGODB_API_KEY!,
      };

      if (input.op === 'get') {
        const res = await fetch(`${base}/action/findOne`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ ...common, filter: { _id: input.key } }),
          signal: AbortSignal.timeout(8000),
        });
        if (!res.ok) return { ok: false, statusCode: res.status, error: res.statusText };
        const json = (await res.json()) as { document?: { value?: unknown } };
        if (!json.document) return { ok: false, statusCode: 404, error: 'Key not found in MongoDB' };
        return { ok: true, statusCode: 200, data: { found: true, key: input.key, value: json.document.value } };
      }

      if (input.op === 'set') {
        const res = await fetch(`${base}/action/updateOne`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            ...common,
            filter: { _id: input.key },
            update: { $set: { value: input.value ?? null, updatedAt: new Date().toISOString() } },
            upsert: true,
          }),
          signal: AbortSignal.timeout(8000),
        });
        if (!res.ok) return { ok: false, statusCode: res.status, error: res.statusText };
        return { ok: true, statusCode: 200, data: { found: true, key: input.key, value: input.value } };
      }

      const res = await fetch(`${base}/action/deleteOne`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ ...common, filter: { _id: input.key } }),
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) return { ok: false, statusCode: res.status, error: res.statusText };
      return { ok: true, statusCode: 200, data: { found: false, key: input.key } };
    },
  },

  turso: {
    id: 'turso',
    isConfigured: (env) => Boolean(env.TURSO_DATABASE_URL && env.TURSO_AUTH_TOKEN),
    execute: async (env, input) => {
      const httpUrl = env.TURSO_DATABASE_URL!.replace(/^libsql:\/\//, 'https://').replace(/\/$/, '');
      const headers = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.TURSO_AUTH_TOKEN}`,
      };

      const stmt =
        input.op === 'get'
          ? { sql: 'SELECT value_json FROM router_kv_store WHERE key = ? LIMIT 1', args: [{ type: 'text', value: input.key }] }
          : input.op === 'set'
            ? {
                sql: 'INSERT INTO router_kv_store (key, value_json, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at',
                args: [
                  { type: 'text', value: input.key },
                  { type: 'text', value: JSON.stringify(input.value ?? null) },
                  { type: 'integer', value: String(Date.now()) },
                ],
              }
            : { sql: 'DELETE FROM router_kv_store WHERE key = ?', args: [{ type: 'text', value: input.key }] };

      const res = await fetch(`${httpUrl}/v2/pipeline`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ requests: [{ type: 'execute', stmt }, { type: 'close' }] }),
        signal: AbortSignal.timeout(8000),
      });

      if (!res.ok) {
        return { ok: false, statusCode: res.status, error: await res.text().catch(() => res.statusText) };
      }

      if (input.op === 'get') {
        const json = (await res.json()) as any;
        const rows = json?.results?.[0]?.response?.result?.rows;
        if (!rows || rows.length === 0) {
          return { ok: false, statusCode: 404, error: 'Key not found in Turso' };
        }
        const rawVal = rows[0]?.[0]?.value;
        return {
          ok: true,
          statusCode: 200,
          data: { found: true, key: input.key, value: rawVal ? JSON.parse(rawVal) : null },
        };
      }

      return {
        ok: true,
        statusCode: 200,
        data: { found: input.op === 'set', key: input.key, value: input.value },
      };
    },
  },
};

export async function routeKvGet(
  env: Env,
  db: AppDb,
  key: string,
  options?: { preferredProvider?: DatabaseProviderId; callerId?: string }
): Promise<RouterDispatchResponse<KvOperationOutput>> {
  const priorityOrder = resolveProviderOrder(
    env.DATABASE_PROVIDER_ORDER,
    DEFAULT_DATABASE_PROVIDERS,
    options?.preferredProvider
  );
  return executeWithFallback({
    channel: 'database',
    env,
    input: { op: 'get', key, db },
    adapters: KV_STORAGE_ADAPTERS,
    priorityOrder,
    db,
    callerId: options?.callerId,
  });
}

export async function routeKvSet(
  env: Env,
  db: AppDb,
  key: string,
  value: unknown,
  options?: { ttlSeconds?: number; preferredProvider?: DatabaseProviderId; callerId?: string }
): Promise<RouterDispatchResponse<KvOperationOutput>> {
  const priorityOrder = resolveProviderOrder(
    env.DATABASE_PROVIDER_ORDER,
    DEFAULT_DATABASE_PROVIDERS,
    options?.preferredProvider
  );
  return executeWithFallback({
    channel: 'database',
    env,
    input: { op: 'set', key, value, ttlSeconds: options?.ttlSeconds, db },
    adapters: KV_STORAGE_ADAPTERS,
    priorityOrder,
    db,
    callerId: options?.callerId,
  });
}

export async function routeKvDelete(
  env: Env,
  db: AppDb,
  key: string,
  options?: { preferredProvider?: DatabaseProviderId; callerId?: string }
): Promise<RouterDispatchResponse<KvOperationOutput>> {
  const priorityOrder = resolveProviderOrder(
    env.DATABASE_PROVIDER_ORDER,
    DEFAULT_DATABASE_PROVIDERS,
    options?.preferredProvider
  );
  return executeWithFallback({
    channel: 'database',
    env,
    input: { op: 'delete', key, db },
    adapters: KV_STORAGE_ADAPTERS,
    priorityOrder,
    db,
    callerId: options?.callerId,
  });
}

export async function checkPrimaryDatabaseHealth(
  env: Env,
  db: AppDb
): Promise<{ ok: boolean; latencyMs: number; capabilities: ProviderCapability[] }> {
  const started = Date.now();
  let ok = false;
  try {
    await db.run(sql`SELECT 1`);
    ok = true;
  } catch {
    ok = false;
  }
  return {
    ok,
    latencyMs: Date.now() - started,
    capabilities: getDatabaseProviderCapabilities(env),
  };
}

export function getDatabaseProviderCapabilities(env: Env): ProviderCapability[] {
  const order = resolveProviderOrder(env.DATABASE_PROVIDER_ORDER, DEFAULT_DATABASE_PROVIDERS);
  return buildChannelCapabilities('database', env, KV_STORAGE_ADAPTERS, order);
}
