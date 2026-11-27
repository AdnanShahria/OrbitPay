import { useCallback, useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { authFetch, getAuthToken, unwrapApiResponse } from '@/shared/utils/api';

export const SETUP_UNLOCK_TOKEN_STORAGE_KEY = 'orbit_setup_unlock_token';
export const SETUP_UNLOCK_EXPIRES_AT_STORAGE_KEY = 'orbit_setup_unlock_expires_at';
export const DEFAULT_SETUP_EMAIL_HINT = 'adn***@gmail.com';
export const SETUP_LOCK_QUERY_KEY = ['setup-lock-status'] as const;

export interface SetupLockStatusResponse {
  locked?: boolean;
  isLocked?: boolean;
  emailHint?: string;
  expiresAt?: string | null;
}

export interface RequestSetupOtpResponse {
  otpId: string;
  expiresAt: string;
  emailHint: string;
  channel: string;
  provider: string;
  devCode?: string;
}

export interface VerifySetupOtpResponse {
  unlockToken: string;
  expiresAt: string;
}

function clearSetupUnlockStorage(): void {
  try {
    sessionStorage.removeItem(SETUP_UNLOCK_TOKEN_STORAGE_KEY);
    sessionStorage.removeItem(SETUP_UNLOCK_EXPIRES_AT_STORAGE_KEY);
  } catch {
    // Ignore sessionStorage errors
  }
}

function getStoredSetupUnlockExpiry(): string | null {
  try {
    return sessionStorage.getItem(SETUP_UNLOCK_EXPIRES_AT_STORAGE_KEY);
  } catch {
    return null;
  }
}

function saveSetupUnlockSession(unlockToken: string, expiresAt: string): void {
  try {
    sessionStorage.setItem(SETUP_UNLOCK_TOKEN_STORAGE_KEY, unlockToken);
    sessionStorage.setItem(SETUP_UNLOCK_EXPIRES_AT_STORAGE_KEY, expiresAt);
  } catch {
    // Ignore sessionStorage quota errors
  }
}

/**
 * Returns the stored setup unlock token if present and non-expired;
 * otherwise clears stale sessionStorage entries and returns null.
 */
export function getSetupUnlockToken(): string | null {
  try {
    const token = sessionStorage.getItem(SETUP_UNLOCK_TOKEN_STORAGE_KEY);
    const expiresAt = sessionStorage.getItem(SETUP_UNLOCK_EXPIRES_AT_STORAGE_KEY);

    if (!token || !expiresAt) {
      if (token || expiresAt) {
        clearSetupUnlockStorage();
      }
      return null;
    }

    const expiresMs = Date.parse(expiresAt);
    if (Number.isNaN(expiresMs) || expiresMs <= Date.now()) {
      clearSetupUnlockStorage();
      return null;
    }

    return token;
  } catch {
    return null;
  }
}

/**
 * Returns the X-Setup-Unlock-Token header object when unlocked, else an empty object.
 */
export function getSetupLockHeaders(): Record<string, string> {
  const token = getSetupUnlockToken();
  return token ? { 'X-Setup-Unlock-Token': token } : {};
}

export function useSetupLock() {
  const queryClient = useQueryClient();
  const [unlockToken, setUnlockToken] = useState<string | null>(() => getSetupUnlockToken());
  const [expiresAt, setExpiresAt] = useState<string | null>(() =>
    getSetupUnlockToken() ? getStoredSetupUnlockExpiry() : null,
  );

  const lockNow = useCallback(() => {
    clearSetupUnlockStorage();
    setUnlockToken(null);
    setExpiresAt(null);
    queryClient.setQueryData<SetupLockStatusResponse>(SETUP_LOCK_QUERY_KEY, (prev) => ({
      locked: true,
      isLocked: true,
      emailHint: prev?.emailHint ?? DEFAULT_SETUP_EMAIL_HINT,
      expiresAt: null,
    }));
  }, [queryClient]);

  const statusQuery = useQuery<SetupLockStatusResponse>({
    queryKey: SETUP_LOCK_QUERY_KEY,
    queryFn: async () => {
      const headers = getSetupLockHeaders();
      const res = await authFetch('/api/v1/merchants/setup-lock/status', {
        headers,
      });
      const data = await unwrapApiResponse<SetupLockStatusResponse>(
        res,
        'Failed to fetch setup lock status',
      );
      const serverLocked = data.isLocked ?? data.locked;
      if (headers['X-Setup-Unlock-Token'] && serverLocked === true) {
        clearSetupUnlockStorage();
      }
      return data;
    },
    enabled: Boolean(getAuthToken()),
    staleTime: 15_000,
  });

  // Sync local token state if the server explicitly rejected a stored token or it expired
  useEffect(() => {
    const serverLocked = statusQuery.data?.isLocked ?? statusQuery.data?.locked;
    if (serverLocked === true && unlockToken) {
      clearSetupUnlockStorage();
      setUnlockToken(null);
      setExpiresAt(null);
    }
  }, [statusQuery.data, unlockToken]);

  // Automatically re-lock when the sessionStorage expiry timestamp elapses
  useEffect(() => {
    if (!unlockToken || !expiresAt) return;
    const expiresMs = Date.parse(expiresAt);
    if (Number.isNaN(expiresMs)) {
      lockNow();
      return;
    }
    const remainingMs = expiresMs - Date.now();
    if (remainingMs <= 0) {
      lockNow();
      return;
    }
    const timer = window.setTimeout(() => {
      lockNow();
    }, remainingMs);
    return () => window.clearTimeout(timer);
  }, [unlockToken, expiresAt, lockNow]);

  const requestOtpMutation = useMutation({
    mutationFn: async () => {
      const res = await authFetch('/api/v1/merchants/setup-lock/request-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      return unwrapApiResponse<RequestSetupOtpResponse>(
        res,
        'Failed to send verification OTP',
      );
    },
  });

  const verifyOtpMutation = useMutation({
    mutationFn: async ({ code, otpId }: { code: string; otpId?: string }) => {
      const res = await authFetch('/api/v1/merchants/setup-lock/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(otpId ? { code, otpId } : { code }),
      });
      return unwrapApiResponse<VerifySetupOtpResponse>(
        res,
        'Failed to verify OTP code',
      );
    },
    onSuccess: (data) => {
      saveSetupUnlockSession(data.unlockToken, data.expiresAt);
      setUnlockToken(data.unlockToken);
      setExpiresAt(data.expiresAt);
      queryClient.invalidateQueries({ queryKey: SETUP_LOCK_QUERY_KEY });
    },
  });

  const requestOtp = useCallback(
    () => requestOtpMutation.mutateAsync(),
    [requestOtpMutation],
  );

  const verifyOtp = useCallback(
    (code: string, otpId?: string) => verifyOtpMutation.mutateAsync({ code, otpId }),
    [verifyOtpMutation],
  );

  const serverLocked = statusQuery.data?.isLocked ?? statusQuery.data?.locked;
  const activeToken = unlockToken && getSetupUnlockToken() ? unlockToken : null;
  const isLocked = !activeToken || serverLocked === true;
  const effectiveExpiresAt = isLocked
    ? null
    : (expiresAt ?? statusQuery.data?.expiresAt ?? null);
  const emailHint = statusQuery.data?.emailHint || DEFAULT_SETUP_EMAIL_HINT;

  return {
    isLocked,
    emailHint,
    expiresAt: effectiveExpiresAt,
    unlockToken: isLocked ? null : activeToken,
    isStatusLoading: statusQuery.isLoading,
    isRequestingOtp: requestOtpMutation.isPending,
    isVerifyingOtp: verifyOtpMutation.isPending,
    requestOtp,
    verifyOtp,
    lockNow,
  };
}
