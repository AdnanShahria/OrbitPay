export const CLIENT_JWT_STORAGE_KEY = 'orbit_client_jwt';
export const UNAUTHORIZED_EVENT = 'orbit:unauthorized';

export function getAuthToken(): string | null {
  try {
    return localStorage.getItem(CLIENT_JWT_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setAuthToken(token: string): void {
  try {
    localStorage.setItem(CLIENT_JWT_STORAGE_KEY, token);
  } catch {
    // Ignore storage quota errors
  }
}

export function clearAuthToken(): void {
  try {
    localStorage.removeItem(CLIENT_JWT_STORAGE_KEY);
  } catch {
    // Ignore storage errors
  }
}

/**
 * Authenticated fetch wrapper for Merchant Portal API calls.
 * Injects `Authorization: Bearer <token>` and handles 401 by clearing
 * the stored JWT and broadcasting an unauthorized event.
 */
export async function authFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const token = getAuthToken();
  const headers = new Headers(init.headers);

  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const res = await fetch(input, {
    ...init,
    headers,
  });

  if (res.status === 401) {
    clearAuthToken();
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(UNAUTHORIZED_EVENT));
    }
  }

  return res;
}

/**
 * Extracts a human-readable message from an ORBIT API error payload.
 */
export function extractApiErrorMessage(json: unknown, fallbackError: string): string {
  if (json && typeof json === 'object') {
    const obj = json as { error?: unknown; message?: unknown };
    if (typeof obj.error === 'string' && obj.error.trim()) {
      return obj.error;
    }
    if (obj.error && typeof obj.error === 'object') {
      const nested = obj.error as { message?: unknown };
      if (typeof nested.message === 'string' && nested.message.trim()) {
        return nested.message;
      }
    }
    if (typeof obj.message === 'string' && obj.message.trim()) {
      return obj.message;
    }
  }
  return fallbackError;
}

/**
 * Unwraps standard `{ success: true, data: T }` ORBIT API responses.
 */
export async function unwrapApiResponse<T>(res: Response, fallbackError = 'Request failed'): Promise<T> {
  const json = await res.json().catch(() => null);

  if (!res.ok || (json && json.success === false)) {
    throw new Error(extractApiErrorMessage(json, `${fallbackError} (HTTP ${res.status})`));
  }

  if (json && typeof json === 'object' && 'data' in json) {
    return json.data as T;
  }

  return json as T;
}
