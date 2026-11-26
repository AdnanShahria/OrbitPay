import { base64UrlEncode, base64UrlEncodeBytes, toExactArrayBuffer } from '../shared/crypto';
import type { Env } from '../shared/types';

const FCM_SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';
const GOOGLE_OAUTH_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const TOKEN_REFRESH_BUFFER_MS = 300_000; // Refresh cached OAuth2 token 5 minutes before expiry

interface FcmServiceAccount {
  client_email: string;
  private_key: string;
  project_id: string;
}

interface CachedAccessToken {
  accessToken: string;
  expiresAtMs: number;
}

const accessTokenCache = new Map<string, CachedAccessToken>();

export interface FcmSendInput {
  token: string;
  title?: string;
  body: string;
  data?: Record<string, unknown>;
}

export interface FcmSendResult {
  ok: boolean;
  statusCode: number;
  externalId?: string;
  error?: string;
  unregistered?: boolean;
  quotaExhausted?: boolean;
}

function parseServiceAccount(env: Env): {
  serviceAccount: FcmServiceAccount;
  projectId: string;
} | null {
  const raw = env.FCM_SERVICE_ACCOUNT_JSON?.trim();
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<FcmServiceAccount>;
    const projectId = env.FCM_PROJECT_ID?.trim() || parsed.project_id?.trim() || '';
    const clientEmail = parsed.client_email?.trim() || '';
    const privateKey = parsed.private_key?.trim() || '';

    if (!clientEmail || !privateKey || !projectId) {
      return null;
    }

    return {
      serviceAccount: {
        client_email: clientEmail,
        private_key: privateKey,
        project_id: projectId,
      },
      projectId,
    };
  } catch {
    return null;
  }
}

export function getFcmV1Status(env: Env): {
  fcmV1Configured: boolean;
  projectId: string | null;
} {
  const parsed = parseServiceAccount(env);
  return {
    fcmV1Configured: Boolean(parsed),
    projectId: parsed?.projectId || env.FCM_PROJECT_ID?.trim() || null,
  };
}

function pemToPkcs8Bytes(pem: string): Uint8Array {
  const base64Body = pem
    .replace(/-----BEGIN [A-Z ]+-----/g, '')
    .replace(/-----END [A-Z ]+-----/g, '')
    .replace(/\\n/g, '')
    .replace(/\s+/g, '');

  const binary = atob(base64Body);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function createSignedGoogleJwt(serviceAccount: FcmServiceAccount): Promise<string> {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const header = base64UrlEncode(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = base64UrlEncode(
    JSON.stringify({
      iss: serviceAccount.client_email,
      scope: FCM_SCOPE,
      aud: GOOGLE_OAUTH_TOKEN_URL,
      iat: nowSeconds,
      exp: nowSeconds + 3600,
    })
  );

  const signingInput = `${header}.${payload}`;
  const pkcs8Bytes = pemToPkcs8Bytes(serviceAccount.private_key);
  const key = await crypto.subtle.importKey(
    'pkcs8',
    toExactArrayBuffer(pkcs8Bytes),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signatureBuffer = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    toExactArrayBuffer(new TextEncoder().encode(signingInput))
  );
  const encodedSignature = base64UrlEncodeBytes(new Uint8Array(signatureBuffer));
  return `${signingInput}.${encodedSignature}`;
}

async function getAccessToken(
  serviceAccount: FcmServiceAccount,
  projectId: string
): Promise<string> {
  const cacheKey = `${serviceAccount.client_email}:${projectId}`;
  const cached = accessTokenCache.get(cacheKey);
  if (cached && Date.now() < cached.expiresAtMs - TOKEN_REFRESH_BUFFER_MS) {
    return cached.accessToken;
  }

  const assertion = await createSignedGoogleJwt(serviceAccount);
  const formBody = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion,
  });

  const res = await fetch(GOOGLE_OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: formBody.toString(),
    signal: AbortSignal.timeout(8000),
  });

  const text = await res.text();
  let json: {
    access_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  } = {};

  try {
    json = JSON.parse(text);
  } catch {
    // Keep empty object and surface raw text below
  }

  if (!res.ok || !json.access_token) {
    const detail = json.error_description || json.error || text.slice(0, 300) || `HTTP ${res.status}`;
    throw new Error(`FCM OAuth2 token exchange failed: ${detail}`);
  }

  const expiresInSec =
    typeof json.expires_in === 'number' && Number.isFinite(json.expires_in) ? json.expires_in : 3600;

  accessTokenCache.set(cacheKey, {
    accessToken: json.access_token,
    expiresAtMs: Date.now() + expiresInSec * 1000,
  });

  return json.access_token;
}

function buildDataPayload(input: FcmSendInput): Record<string, string> {
  const data: Record<string, string> = {};

  if (input.data) {
    for (const [key, value] of Object.entries(input.data)) {
      if (value !== undefined && value !== null) {
        data[key] = typeof value === 'string' ? value : String(value);
      }
    }
  }

  data.title = input.title || data.title || 'ORBIT Payment Hub';
  data.body = input.body;
  return data;
}

function isUnregisteredError(statusCode: number, rawBody: string): boolean {
  if (statusCode === 404) {
    return true;
  }
  if (rawBody.toUpperCase().includes('UNREGISTERED')) {
    return true;
  }
  try {
    const parsed = JSON.parse(rawBody) as {
      error?: {
        status?: string;
        details?: Array<{ errorCode?: string }>;
      };
    };
    if (parsed.error?.status === 'UNREGISTERED') {
      return true;
    }
    if (parsed.error?.details?.some((d) => d.errorCode === 'UNREGISTERED')) {
      return true;
    }
  } catch {
    // Ignore non-JSON error bodies
  }
  return false;
}

/**
 * Dispatches a data-only FCM HTTP v1 push message using Web Crypto RS256 OAuth2 service account auth.
 */
export async function sendFcmV1Message(env: Env, input: FcmSendInput): Promise<FcmSendResult> {
  const config = parseServiceAccount(env);
  if (!config) {
    return {
      ok: false,
      statusCode: 500,
      error: 'FCM_SERVICE_ACCOUNT_JSON is missing or invalid',
    };
  }

  const { serviceAccount, projectId } = config;
  const cacheKey = `${serviceAccount.client_email}:${projectId}`;

  let accessToken: string;
  try {
    accessToken = await getAccessToken(serviceAccount, projectId);
  } catch (err: any) {
    return {
      ok: false,
      statusCode: 401,
      error: err?.message || 'Failed to obtain FCM OAuth2 access token',
    };
  }

  const endpoint = `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/messages:send`;
  const payload = {
    message: {
      token: input.token,
      data: buildDataPayload(input),
      android: {
        priority: 'HIGH',
      },
    },
  };

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(8000),
  });

  const rawBody = await res.text().catch(() => '');

  if (!res.ok) {
    if (res.status === 401) {
      accessTokenCache.delete(cacheKey);
    }

    const unregistered = isUnregisteredError(res.status, rawBody);
    return {
      ok: false,
      statusCode: res.status,
      error: rawBody.slice(0, 400) || res.statusText || `HTTP ${res.status}`,
      unregistered,
      quotaExhausted: res.status === 429,
    };
  }

  let externalId: string | undefined;
  try {
    const parsed = JSON.parse(rawBody) as { name?: string };
    externalId = parsed.name;
  } catch {
    // Ignore non-JSON success body
  }

  return {
    ok: true,
    statusCode: res.status,
    externalId,
  };
}
