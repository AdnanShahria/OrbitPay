/**
 * Frontend Service Router Client
 * Never stores, reads, or references any provider API keys or secrets.
 * All requests are forwarded to `/api/v1/router/*` where the backend verifies
 * the caller and selects/falls back across configured providers.
 */

export interface RouterCallerAuth {
  adminKey?: string;
  merchantSecret?: string;
  deviceKey?: string;
}

export interface RouterProviderAttempt {
  provider: string;
  ok: boolean;
  statusCode?: number;
  error?: string;
  quotaExhausted?: boolean;
  skippedDueToCooldown?: boolean;
  latencyMs: number;
}

export interface RouterDispatchResponse<T = unknown> {
  success: boolean;
  channel: 'email' | 'sms' | 'image' | 'database';
  providerUsed: string | null;
  fallbackTriggered: boolean;
  attempts: RouterProviderAttempt[];
  data?: T;
  error?: string;
}

export interface ProviderCapability {
  provider: string;
  configured: boolean;
  priority: number;
  inCooldown: boolean;
  cooldownUntil?: string;
}

export function buildRouterHeaders(
  auth?: RouterCallerAuth,
  includeJsonContentType = true
): Record<string, string> {
  const headers: Record<string, string> = {};
  if (includeJsonContentType) {
    headers['Content-Type'] = 'application/json';
  }

  const storedAdminKey =
    typeof sessionStorage !== 'undefined'
      ? sessionStorage.getItem('orbit_master_admin_key')
      : null;

  if (auth?.adminKey || storedAdminKey) {
    headers['X-Admin-Key'] = auth?.adminKey || storedAdminKey || '';
  } else if (auth?.merchantSecret) {
    headers['X-Merchant-Secret'] = auth.merchantSecret;
  } else if (auth?.deviceKey) {
    headers['X-Device-Key'] = auth.deviceKey;
  }

  return headers;
}

export async function routerRequest<T>(
  path: string,
  options: RequestInit & { auth?: RouterCallerAuth; isMultipart?: boolean } = {}
): Promise<T> {
  const { auth, isMultipart, headers: extraHeaders, ...rest } = options;
  const baseHeaders = buildRouterHeaders(auth, !isMultipart);

  const res = await fetch(`/api/v1/router${path}`, {
    ...rest,
    headers: {
      ...baseHeaders,
      ...(extraHeaders as Record<string, string> | undefined),
    },
  });

  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(payload?.error || `Router request failed (${res.status})`);
  }

  return payload as T;
}
