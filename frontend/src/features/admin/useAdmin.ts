import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { extractApiErrorMessage } from '@/shared/utils/api';

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

export function getStoredAdminKey(): string | null {
  return sessionStorage.getItem(ADMIN_KEY_STORAGE);
}

export function useAdminAuth() {
  const [adminKey, setAdminKey] = useState<string | null>(getStoredAdminKey);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(!!getStoredAdminKey());

  useEffect(() => {
    const key = getStoredAdminKey();
    setAdminKey(key);
    setIsAuthenticated(!!key);
  }, []);

  const login = (key: string) => {
    sessionStorage.setItem(ADMIN_KEY_STORAGE, key);
    setAdminKey(key);
    setIsAuthenticated(true);
  };

  const logout = () => {
    sessionStorage.removeItem(ADMIN_KEY_STORAGE);
    setAdminKey(null);
    setIsAuthenticated(false);
  };

  return {
    adminKey,
    isAuthenticated,
    login,
    logout,
  };
}

export function useAdminOverview() {
  const adminKey = getStoredAdminKey();

  return useQuery<AdminOverviewStats>({
    queryKey: ['admin', 'overview'],
    queryFn: async () => {
      const res = await fetch('/api/v1/admin/overview', {
        headers: {
          'x-admin-key': adminKey || '',
        },
      });
      if (!res.ok) throw new Error(`Failed to load admin overview: ${res.statusText}`);
      const json = await res.json();
      return json.data;
    },
    enabled: !!adminKey,
    refetchInterval: 10_000,
  });
}

export function useAdminProjects() {
  const adminKey = getStoredAdminKey();

  return useQuery<AdminProjectSummary[]>({
    queryKey: ['admin', 'projects'],
    queryFn: async () => {
      const res = await fetch('/api/v1/admin/projects', {
        headers: {
          'x-admin-key': adminKey || '',
        },
      });
      if (!res.ok) throw new Error(`Failed to load admin projects: ${res.statusText}`);
      const json = await res.json();
      return json.data;
    },
    enabled: !!adminKey,
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
  const adminKey = getStoredAdminKey();

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
      const res = await fetch('/api/v1/admin/projects', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-key': adminKey || '',
        },
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
  const adminKey = getStoredAdminKey();

  return useQuery<{ users: AdminMerchantUser[]; sessions: AdminAuthSession[] }>({
    queryKey: ['admin', 'project-users', projectId],
    queryFn: async () => {
      const res = await fetch(`/api/v1/admin/projects/${projectId}/users`, {
        headers: {
          'x-admin-key': adminKey || '',
        },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(extractApiErrorMessage(err, 'Failed to load project users'));
      }
      const json = await res.json();
      return json.data;
    },
    enabled: Boolean(adminKey && projectId),
  });
}

export function useCreateProjectUserMutation() {
  const queryClient = useQueryClient();
  const adminKey = getStoredAdminKey();

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
      const res = await fetch(`/api/v1/admin/projects/${projectId}/users`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-key': adminKey || '',
        },
        body: JSON.stringify({ email, fullName, password, role }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(extractApiErrorMessage(err, 'Failed to create user'));
      }
      const json = await res.json();
      return json.data;
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'project-users', vars.projectId] });
    },
  });
}

export function useResetUserPasswordMutation() {
  const queryClient = useQueryClient();
  const adminKey = getStoredAdminKey();

  return useMutation({
    mutationFn: async ({
      userId,
      password,
    }: {
      projectId: string;
      userId: string;
      password?: string;
    }): Promise<{ userId: string; email: string; newPassword: string }> => {
      const res = await fetch(`/api/v1/admin/users/${userId}/reset-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-key': adminKey || '',
        },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(extractApiErrorMessage(err, 'Failed to reset password'));
      }
      const json = await res.json();
      return json.data;
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'project-users', vars.projectId] });
    },
  });
}

export function useRevokeSessionMutation() {
  const queryClient = useQueryClient();
  const adminKey = getStoredAdminKey();

  return useMutation({
    mutationFn: async ({
      sessionId,
    }: {
      projectId: string;
      sessionId: string;
    }) => {
      const res = await fetch(`/api/v1/admin/sessions/${sessionId}`, {
        method: 'DELETE',
        headers: {
          'x-admin-key': adminKey || '',
        },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(extractApiErrorMessage(err, 'Failed to revoke session'));
      }
      return await res.json();
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'project-users', vars.projectId] });
    },
  });
}

export function useUpdateProjectMutation() {
  const queryClient = useQueryClient();
  const adminKey = getStoredAdminKey();

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
      const res = await fetch(`/api/v1/admin/projects/${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-key': adminKey || '',
        },
        body: JSON.stringify(updates),
      });
      if (!res.ok) throw new Error('Failed to update project settings');
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'projects'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'overview'] });
    },
  });
}

export function useAdminWebhooks() {
  const adminKey = getStoredAdminKey();

  return useQuery<WebhookDeliverySummary[]>({
    queryKey: ['admin', 'webhooks'],
    queryFn: async () => {
      const res = await fetch('/api/v1/admin/webhooks', {
        headers: {
          'x-admin-key': adminKey || '',
        },
      });
      if (!res.ok) throw new Error('Failed to load webhook audit logs');
      const json = await res.json();
      return json.data;
    },
    enabled: !!adminKey,
    refetchInterval: 10_000,
  });
}

export function useRetryWebhooksMutation() {
  const queryClient = useQueryClient();
  const adminKey = getStoredAdminKey();

  return useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/v1/admin/webhooks/retry', {
        method: 'POST',
        headers: {
          'x-admin-key': adminKey || '',
        },
      });
      if (!res.ok) throw new Error('Retry trigger failed');
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'webhooks'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'overview'] });
    },
  });
}

export function useAdminQueue() {
  const adminKey = getStoredAdminKey();

  return useQuery<QueueSummaryItem[]>({
    queryKey: ['admin', 'queue'],
    queryFn: async () => {
      const res = await fetch('/api/v1/admin/queue', {
        headers: {
          'x-admin-key': adminKey || '',
        },
      });
      if (!res.ok) throw new Error('Failed to load verification queue');
      const json = await res.json();
      return json.data;
    },
    enabled: !!adminKey,
    refetchInterval: 8_000,
  });
}

export function useSeedDemoProjectsMutation() {
  const queryClient = useQueryClient();
  const adminKey = getStoredAdminKey();

  return useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/v1/admin/seed-demo', {
        method: 'POST',
        headers: {
          'x-admin-key': adminKey || '',
        },
      });
      if (!res.ok) throw new Error('Demo seeding failed');
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'projects'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'overview'] });
    },
  });
}
