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
 * Unwraps standard `{ success: true, data: T }` ORBIT API responses.
 */
export async function unwrapApiResponse<T>(res: Response, fallbackError = 'Request failed'): Promise<T> {
  const json = await res.json().catch(() => null);

  if (!res.ok || (json && json.success === false)) {
    const message =
      (json && (json.error || json.message)) ||
      `${fallbackError} (HTTP ${res.status})`;
    throw new Error(message);
  }

  if (json && typeof json === 'object' && 'data' in json) {
    return json.data as T;
  }

  return json as T;
}
