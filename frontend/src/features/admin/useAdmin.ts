import { useState, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { extractApiErrorMessage, unwrapApiResponse } from '@/shared/utils/api';

export interface AdminProjectSummary {
  id: string;
  storeName: string;
  webhookUrl: string;
  webhookSecret: string;
  gracePeriodMinutes: number;
  isActive: boolean;
  lastSeenAt: string | null;
  createdAt: string;
  isOnline: boolean;
  walletsCount: number;
  totalVolume: number;
  verifiedCount: number;
  unclaimedCount: number;
}

export interface AdminOverviewStats {
  totalProjects: number;
  activeProjects: number;
  totalVolume: number;
  totalTransactions: number;
  verifiedTransactions: number;
  unclaimedTransactions: number;
  onlineDevices: number;
  totalWallets: number;
  pendingQueueCount: number;
  webhookSuccessRate: number;
  totalWebhooksSent: number;
}

export interface WebhookDeliverySummary {
  id: string;
  merchantId: string;
  eventType: string;
  externalOrderId: string;
  attemptCount: number;
  status: 'DELIVERED' | 'FAILED' | 'RETRYING';
  responseStatus: number | null;
  responseBody: string | null;
  lastAttemptAt: string | null;
  deliveredAt: string | null;
  nextRetryAt: string | null;
  storeName: string | null;
  webhookUrl: string | null;
}

export interface QueueSummaryItem {
  id: string;
  merchantId: string;
  provider: string;
  externalOrderId: string;
  customerEmail: string;
  expectedAmount: number;
  submittedTrxId: string;
  submittedSender: string;
  status: string;
  expiresAt: string;
  createdAt: string;
  storeName: string | null;
}

export const ADMIN_KEY_STORAGE = 'orbit_master_admin_key';
export const ADMIN_UNAUTHORIZED_EVENT = 'orbit:admin-unauthorized';

export function getStoredAdminKey(): string | null {
  try {
    return sessionStorage.getItem(ADMIN_KEY_STORAGE);
  } catch {
    return null;
  }
}

export function setStoredAdminKey(key: string): void {
  try {
    sessionStorage.setItem(ADMIN_KEY_STORAGE, key.trim());
  } catch {
    // Ignore storage quota errors
  }
}

export function clearStoredAdminKey(): void {
  try {
    sessionStorage.removeItem(ADMIN_KEY_STORAGE);
  } catch {
    // Ignore storage errors
  }
}

/**
 * Authenticated fetch wrapper for Root Admin Hub API calls.
 * Reads the current key dynamically at request time and clears stale keys on 401.
 */
export async function adminFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const adminKey = getStoredAdminKey()?.trim() || '';
  const headers = new Headers(init.headers);

  if (adminKey && !headers.has('x-admin-key')) {
    headers.set('x-admin-key', adminKey);
  }

  const res = await fetch(input, {
    ...init,
    headers,
  });

  if (res.status === 401) {
    const currentKey = getStoredAdminKey()?.trim() || '';
    if (adminKey && currentKey === adminKey) {
      clearStoredAdminKey();
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent(ADMIN_UNAUTHORIZED_EVENT));
      }
    }
  }

  return res;
}

export function useAdminAuth() {
  const queryClient = useQueryClient();
  const [adminKey, setAdminKey] = useState<string | null>(() => getStoredAdminKey());
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [isVerifying, setIsVerifying] = useState<boolean>(() => Boolean(getStoredAdminKey()?.trim()));

  const clearAdminSession = useCallback(() => {
    clearStoredAdminKey();
    setAdminKey(null);
    setIsAuthenticated(false);
    setIsVerifying(false);
    queryClient.removeQueries({ queryKey: ['admin'] });
  }, [queryClient]);

  useEffect(() => {
    let active = true;
    const storedKey = getStoredAdminKey()?.trim();

    if (!storedKey) {
      setIsAuthenticated(false);
      setIsVerifying(false);
      return;
    }

    (async () => {
      try {
        const res = await fetch('/api/v1/admin/auth/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ adminKey: storedKey }),
        });
        const json = await res.json().catch(() => null);
        if (!active) return;

        if (res.ok && json?.success) {
          setAdminKey(storedKey);
          setIsAuthenticated(true);
        } else {
          clearAdminSession();
        }
      } catch {
        if (!active) return;
        clearAdminSession();
      } finally {
        if (active) {
          setIsVerifying(false);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [clearAdminSession]);

  useEffect(() => {
    const handleUnauthorized = () => {
      clearAdminSession();
    };

    window.addEventListener(ADMIN_UNAUTHORIZED_EVENT, handleUnauthorized);
    return () => window.removeEventListener(ADMIN_UNAUTHORIZED_EVENT, handleUnauthorized);
  }, [clearAdminSession]);

  const login = useCallback(
    (key: string) => {
      const cleanKey = key.trim();
      setStoredAdminKey(cleanKey);
      setAdminKey(cleanKey);
      setIsAuthenticated(true);
      setIsVerifying(false);
      queryClient.invalidateQueries({ queryKey: ['admin'] });
    },
    [queryClient],
  );

  const logout = useCallback(() => {
    clearAdminSession();
  }, [clearAdminSession]);

  return {
    adminKey,
    isAuthenticated,
    isVerifying,
    login,
    logout,
  };
}

export function useAdminOverview(enabled = true) {
  return useQuery<AdminOverviewStats>({
    queryKey: ['admin', 'overview'],
    queryFn: async () => {
      const res = await adminFetch('/api/v1/admin/overview');
      return unwrapApiResponse<AdminOverviewStats>(res, 'Failed to load admin overview');
    },
    enabled: Boolean(enabled && getStoredAdminKey()),
    retry: false,
    refetchInterval: 10_000,
  });
}

export function useAdminProjects(enabled = true) {
  return useQuery<AdminProjectSummary[]>({
    queryKey: ['admin', 'projects'],
    queryFn: async () => {
      const res = await adminFetch('/api/v1/admin/projects');
      return unwrapApiResponse<AdminProjectSummary[]>(res, 'Failed to load admin projects');
    },
    enabled: Boolean(enabled && getStoredAdminKey()),
    retry: false,
    refetchInterval: 10_000,
  });
}

export interface AdminMerchantUser {
  id: string;
  merchantId: string;
  email: string;
  fullName: string | null;
  role: 'MERCHANT_OWNER' | 'MERCHANT_STAFF' | string;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface AdminAuthSession {
  id: string;
  userId: string;
  merchantId: string;
  deviceType: 'WEB' | 'ANDROID' | string;
  deviceName: string | null;
  ipAddress?: string | null;
  expiresAt: string;
  revokedAt: string | null;
  createdAt: string;
}

export interface CreateProjectResponseData {
  id: string;
  storeName: string;
  webhookUrl: string;
  webhookSecret: string;
  deviceKey: string;
  gracePeriodMinutes: number;
  ownerAccount?: {
    id: string;
    email: string;
    password: string;
    role: string;
  };
}

export function useCreateProjectMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: {
      id?: string;
      storeName: string;
      webhookUrl?: string;
      gracePeriodMinutes: number;
      ownerEmail?: string;
      ownerPassword?: string;
      ownerName?: string;
    }): Promise<{ success: boolean; data: CreateProjectResponseData }> => {
      const res = await adminFetch('/api/v1/admin/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(extractApiErrorMessage(err, 'Failed to onboard project'));
      }
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'projects'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'overview'] });
    },
  });
}

export function useAdminProjectUsers(projectId: string | null) {
  return useQuery<{ users: AdminMerchantUser[]; sessions: AdminAuthSession[] }>({
    queryKey: ['admin', 'project-users', projectId],
    queryFn: async () => {
      const res = await adminFetch(`/api/v1/admin/projects/${projectId}/users`);
      return unwrapApiResponse<{ users: AdminMerchantUser[]; sessions: AdminAuthSession[] }>(
        res,
        'Failed to load project users',
      );
    },
    enabled: Boolean(getStoredAdminKey() && projectId),
    retry: false,
  });
}

export function useCreateProjectUserMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      projectId,
      email,
      fullName,
      password,
      role,
    }: {
      projectId: string;
      email: string;
      fullName?: string;
      password?: string;
      role?: 'MERCHANT_OWNER' | 'MERCHANT_STAFF';
    }): Promise<{ user: AdminMerchantUser; generatedPassword?: string }> => {
      const res = await adminFetch(`/api/v1/admin/projects/${projectId}/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, fullName, password, role }),
      });
      return unwrapApiResponse<{ user: AdminMerchantUser; generatedPassword?: string }>(
        res,
        'Failed to create user',
      );
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'project-users', vars.projectId] });
    },
  });
}

export function useResetUserPasswordMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      userId,
      password,
    }: {
      projectId: string;
      userId: string;
      password?: string;
    }): Promise<{ userId: string; email: string; newPassword: string }> => {
      const res = await adminFetch(`/api/v1/admin/users/${userId}/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = await unwrapApiResponse<{
        userId: string;
        email: string;
        password?: string;
        newPassword?: string;
      }>(res, 'Failed to reset password');
      return {
        userId: data.userId,
        email: data.email,
        newPassword: data.newPassword ?? data.password ?? '',
      };
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'project-users', vars.projectId] });
    },
  });
}

export function useRevokeSessionMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      sessionId,
    }: {
      projectId: string;
      sessionId: string;
    }) => {
      const res = await adminFetch(`/api/v1/admin/sessions/${sessionId}`, {
        method: 'DELETE',
      });
      return unwrapApiResponse(res, 'Failed to revoke session');
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'project-users', vars.projectId] });
    },
  });
}

export function useUpdateProjectMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      updates,
    }: {
      id: string;
      updates: {
        storeName?: string;
        webhookUrl?: string;
        gracePeriodMinutes?: number;
        isActive?: boolean;
      };
    }) => {
      const res = await adminFetch(`/api/v1/admin/projects/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      return unwrapApiResponse(res, 'Failed to update project settings');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'projects'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'overview'] });
    },
  });
}

export function useAdminWebhooks(enabled = true) {
  return useQuery<WebhookDeliverySummary[]>({
    queryKey: ['admin', 'webhooks'],
    queryFn: async () => {
      const res = await adminFetch('/api/v1/admin/webhooks');
      return unwrapApiResponse<WebhookDeliverySummary[]>(res, 'Failed to load webhook audit logs');
    },
    enabled: Boolean(enabled && getStoredAdminKey()),
    retry: false,
    refetchInterval: 10_000,
  });
}

export function useRetryWebhooksMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const res = await adminFetch('/api/v1/admin/webhooks/retry', {
        method: 'POST',
      });
      return unwrapApiResponse(res, 'Retry trigger failed');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'webhooks'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'overview'] });
    },
  });
}

export function useAdminQueue(enabled = true) {
  return useQuery<QueueSummaryItem[]>({
    queryKey: ['admin', 'queue'],
    queryFn: async () => {
      const res = await adminFetch('/api/v1/admin/queue');
      return unwrapApiResponse<QueueSummaryItem[]>(res, 'Failed to load verification queue');
    },
    enabled: Boolean(enabled && getStoredAdminKey()),
    retry: false,
    refetchInterval: 8_000,
  });
}

export function useSeedDemoProjectsMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const res = await adminFetch('/api/v1/admin/seed-demo', {
        method: 'POST',
      });
      return unwrapApiResponse(res, 'Demo seeding failed');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'projects'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'overview'] });
    },
  });
}
