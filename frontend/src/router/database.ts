import {
  routerRequest,
  type ProviderCapability,
  type RouterCallerAuth,
  type RouterDispatchResponse,
} from './client';

export type DatabaseProvider = 'd1' | 'kv' | 'supabase' | 'mongodb' | 'turso';

export interface DatabaseHealthResult {
  ok: boolean;
  latencyMs: number;
  capabilities: ProviderCapability[];
}

export interface KvResult<T = unknown> {
  found: boolean;
  key: string;
  value?: T;
}

export async function getDatabaseHealth(auth?: RouterCallerAuth): Promise<DatabaseHealthResult> {
  const res = await routerRequest<{ success: boolean; data: DatabaseHealthResult }>(
    '/database/health',
    { method: 'GET', auth }
  );
  return res.data;
}

export function kvSet<T = unknown>(
  key: string,
  value: T,
  options?: { ttlSeconds?: number; preferredProvider?: DatabaseProvider },
  auth?: RouterCallerAuth
): Promise<RouterDispatchResponse<KvResult<T>>> {
  return routerRequest<RouterDispatchResponse<KvResult<T>>>('/database/kv', {
    method: 'POST',
    body: JSON.stringify({
      key,
      value,
      ttlSeconds: options?.ttlSeconds,
      preferredProvider: options?.preferredProvider,
    }),
    auth,
  });
}

export function kvGet<T = unknown>(
  key: string,
  auth?: RouterCallerAuth
): Promise<RouterDispatchResponse<KvResult<T>>> {
  return routerRequest<RouterDispatchResponse<KvResult<T>>>(
    `/database/kv/${encodeURIComponent(key)}`,
    { method: 'GET', auth }
  );
}

export function kvDelete(
  key: string,
  auth?: RouterCallerAuth
): Promise<RouterDispatchResponse<KvResult>> {
  return routerRequest<RouterDispatchResponse<KvResult>>(
    `/database/kv/${encodeURIComponent(key)}`,
    { method: 'DELETE', auth }
  );
}
