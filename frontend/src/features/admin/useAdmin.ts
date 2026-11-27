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

export interface AdminUserProfile {
  id: string;
  email: string;
  fullName: string | null;
  role: 'SUPER_ADMIN' | 'ADMIN_OPERATOR' | 'MASTER_ADMIN' | string;
  isActive?: boolean;
  lastLoginAt?: string | null;
  createdAt?: string;
}

export interface AdminAuthSessionInfo {
  id: string;
  adminUserId?: string | null;
  adminEmail?: string | null;
  email?: string | null;
  role?: string;
  authMethod?: string;
  ipAddress?: string | null;
  userAgent?: string | null;
  expiresAt: string;
  revokedAt?: string | null;
  createdAt?: string;
}

export interface AdminAuditLogItem {
  id: string;
  action: string;
  adminUserId?: string | null;
  adminEmail?: string | null;
  actorId?: string | null;
  actorEmail?: string | null;
  actorRole?: string | null;
  targetType?: string | null;
  targetId?: string | null;
  metadataJson?: string | null;
  details?: string | null;
  ipAddress?: string | null;
  createdAt: string;
}

export interface AdminSecurityState {
  hasAdminUsers: boolean;
  currentAdmin?: AdminUserProfile | null;
  currentSession?: AdminAuthSessionInfo | null;
  adminUsers: AdminUserProfile[];
  sessions: AdminAuthSessionInfo[];
  auditLogs: AdminAuditLogItem[];
}

export interface AdminSystemTableStatus {
  name: string;
  exists: boolean;
  rowCount?: number;
}

export interface AdminSystemHealth {
  environment: string;
  simulatorEnabled: boolean;
  r2Configured: boolean;
  pushHubConfigured: boolean;
  fcmConfigured: boolean;
  schemaHealthy: boolean;
  missingTables: string[];
  tables: AdminSystemTableStatus[];
  checkedAt?: string;
}

export interface AdminProjectInspectWallet {
  id: string;
  provider: string;
  accountType: string;
  walletNumber: string;
  monthlyVolumeLimit: number;
  currentMonthVolume: number;
  isPrimary: boolean;
  isActive: boolean;
}

export interface AdminProjectInspectLedgerItem {
  id: string;
  provider: string;
  trxId: string;
  amount: number;
  senderNumber: string;
  status: string;
  createdAt: string;
}

export interface AdminProjectInspectOrderItem {
  id: string;
  externalOrderId: string;
  customerName?: string | null;
  customerEmail?: string | null;
  baseAmount?: number;
  uniqueAmount?: number | null;
  paidAmount?: number | null;
  totalAmount?: number;
  expectedAmount?: number;
  amount?: number;
  paymentStatus: string;
  orderStatus: string;
  createdAt?: string;
}

export interface AdminProjectInspectData {
  project: AdminProjectSummary;
  wallets: AdminProjectInspectWallet[];
  recentSms: AdminProjectInspectLedgerItem[];
  recentOrders: AdminProjectInspectOrderItem[];
}

export const ADMIN_KEY_STORAGE = 'orbit_master_admin_key';
export const ADMIN_TOKEN_STORAGE = 'orbit_admin_jwt';
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

export function getStoredAdminToken(): string | null {
  try {
    return sessionStorage.getItem(ADMIN_TOKEN_STORAGE);
  } catch {
    return null;
  }
}

export function setStoredAdminToken(token: string): void {
  try {
    sessionStorage.setItem(ADMIN_TOKEN_STORAGE, token.trim());
  } catch {
    // Ignore storage quota errors
  }
}

export function clearStoredAdminToken(): void {
  try {
    sessionStorage.removeItem(ADMIN_TOKEN_STORAGE);
  } catch {
    // Ignore storage errors
  }
}

export function hasAdminCredentials(): boolean {
  return Boolean(getStoredAdminToken()?.trim() || getStoredAdminKey()?.trim());
}

/**
 * Authenticated fetch wrapper for Root Admin Hub API calls.
 * Prefers Admin JWT (`Authorization: Bearer`) and includes `x-admin-key` if present.
 * Clears stale credentials and broadcasts `ADMIN_UNAUTHORIZED_EVENT` on HTTP 401.
 */
export async function adminFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const adminToken = getStoredAdminToken()?.trim() || '';
  const adminKey = getStoredAdminKey()?.trim() || '';
  const headers = new Headers(init.headers);

  if (adminToken && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${adminToken}`);
  } else if (adminKey && !headers.has('x-admin-key')) {
    headers.set('x-admin-key', adminKey);
  }

  const res = await fetch(input, {
    ...init,
    cache: 'no-store',
    headers,
  });

  if (res.status === 401) {
    const currentToken = getStoredAdminToken()?.trim() || '';
    const currentKey = getStoredAdminKey()?.trim() || '';
    const sameToken = adminToken && currentToken === adminToken;
    const sameKey = adminKey && currentKey === adminKey;
    if (sameToken || sameKey) {
      clearStoredAdminToken();
      clearStoredAdminKey();
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent(ADMIN_UNAUTHORIZED_EVENT));
      }
    }
  }

  return res;
}

interface AdminAuthVerifyPayload {
  accessToken?: string;
  token?: string;
  role?: string;
  admin?: AdminUserProfile | null;
  session?: AdminAuthSessionInfo | null;
  hasAdminUsers?: boolean;
}

export function useAdminAuth() {
  const queryClient = useQueryClient();
  const [adminKey, setAdminKey] = useState<string | null>(() => getStoredAdminKey());
  const [admin, setAdmin] = useState<AdminUserProfile | null>(null);
  const [session, setSession] = useState<AdminAuthSessionInfo | null>(null);
  const [hasAdminUsers, setHasAdminUsers] = useState<boolean | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [isVerifying, setIsVerifying] = useState<boolean>(() => hasAdminCredentials());
  const [isLoggingOut, setIsLoggingOut] = useState<boolean>(false);

  const clearAdminSession = useCallback(() => {
    clearStoredAdminToken();
    clearStoredAdminKey();
    setAdminKey(null);
    setAdmin(null);
    setSession(null);
    setIsAuthenticated(false);
    setIsVerifying(false);
    queryClient.removeQueries({ queryKey: ['admin'] });
  }, [queryClient]);

  const applyVerifiedPayload = useCallback(
    (payload: AdminAuthVerifyPayload | null | undefined, fallbackKey?: string) => {
      const jwt = payload?.accessToken ?? payload?.token;
      if (jwt) {
        setStoredAdminToken(jwt);
      }
      if (payload?.admin !== undefined) {
        setAdmin(payload.admin ?? null);
      } else if (payload?.role) {
        setAdmin({
          id: 'master_admin',
          email: 'Master Security Key',
          fullName: 'Master Admin',
          role: payload.role,
        });
      }
      if (payload?.session !== undefined) {
        setSession(payload.session ?? null);
      }
      if (typeof payload?.hasAdminUsers === 'boolean') {
        setHasAdminUsers(payload.hasAdminUsers);
      }
      if (fallbackKey) {
        setAdminKey(fallbackKey);
      }
      setIsAuthenticated(true);
      setIsVerifying(false);
    },
    [],
  );

  const refreshAuth = useCallback(async () => {
    const storedToken = getStoredAdminToken()?.trim();
    const storedKey = getStoredAdminKey()?.trim();

    if (storedToken) {
      const res = await adminFetch('/api/v1/admin/auth/me');
      const json = await res.json().catch(() => null);
      if (res.ok && json?.success) {
        applyVerifiedPayload(json.data as AdminAuthVerifyPayload);
        return true;
      }
      clearStoredAdminToken();
    }

    if (storedKey) {
      const res = await fetch('/api/v1/admin/auth/verify', {
        method: 'POST',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminKey: storedKey }),
      });
      const json = await res.json().catch(() => null);
      if (res.ok && json?.success) {
        applyVerifiedPayload(json.data as AdminAuthVerifyPayload);
        clearStoredAdminKey();
        return true;
      }
    }

    clearAdminSession();
    return false;
  }, [applyVerifiedPayload, clearAdminSession]);

  useEffect(() => {
    let active = true;
    if (!hasAdminCredentials()) {
      setIsAuthenticated(false);
      setIsVerifying(false);
      return;
    }

    (async () => {
      try {
        await refreshAuth();
      } catch {
        if (active) clearAdminSession();
      } finally {
        if (active) setIsVerifying(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [refreshAuth, clearAdminSession]);

  useEffect(() => {
    const handleUnauthorized = () => {
      clearAdminSession();
    };

    const handlePageShow = (event: PageTransitionEvent) => {
      if (event.persisted) {
        if (!hasAdminCredentials()) {
          clearAdminSession();
        } else {
          void refreshAuth();
        }
      }
    };

    const handleStorage = (event: StorageEvent) => {
      if (
        (event.key === ADMIN_TOKEN_STORAGE || event.key === ADMIN_KEY_STORAGE) &&
        !hasAdminCredentials()
      ) {
        clearAdminSession();
      }
    };

    window.addEventListener(ADMIN_UNAUTHORIZED_EVENT, handleUnauthorized);
    window.addEventListener('pageshow', handlePageShow);
    window.addEventListener('storage', handleStorage);
    return () => {
      window.removeEventListener(ADMIN_UNAUTHORIZED_EVENT, handleUnauthorized);
      window.removeEventListener('pageshow', handlePageShow);
      window.removeEventListener('storage', handleStorage);
    };
  }, [clearAdminSession, refreshAuth]);

  const loginWithPassword = useCallback(
    async (email: string, password: string) => {
      const res = await fetch('/api/v1/admin/auth/login', {
        method: 'POST',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const data = await unwrapApiResponse<AdminAuthVerifyPayload>(
        res,
        'Invalid admin email or password',
      );
      clearStoredAdminKey();
      setAdminKey(null);
      applyVerifiedPayload(data);
      queryClient.invalidateQueries({ queryKey: ['admin'] });
      return data;
    },
    [applyVerifiedPayload, queryClient],
  );

  const loginWithMasterKey = useCallback(
    async (key: string) => {
      const cleanKey = key.trim();
      const res = await fetch('/api/v1/admin/auth/verify', {
        method: 'POST',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminKey: cleanKey }),
      });
      const data = await unwrapApiResponse<AdminAuthVerifyPayload>(
        res,
        'Invalid Master Admin Key',
      );
      // Do not persist raw Master Key once a server-tracked JWT is issued so logout/revocation is absolute
      if (data?.accessToken ?? data?.token) {
        clearStoredAdminKey();
        setAdminKey(null);
        applyVerifiedPayload(data);
      } else {
        setStoredAdminKey(cleanKey);
        applyVerifiedPayload(data, cleanKey);
      }
      queryClient.invalidateQueries({ queryKey: ['admin'] });
      return data;
    },
    [applyVerifiedPayload, queryClient],
  );

  // Kept compatible for callers passing a raw master key after verification
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

  const logout = useCallback(async () => {
    setIsLoggingOut(true);
    const token = getStoredAdminToken()?.trim();
    const key = getStoredAdminKey()?.trim();

    await queryClient.cancelQueries({ queryKey: ['admin'] }).catch(() => null);
    clearAdminSession();

    try {
      if (token || key) {
        const headers = new Headers();
        if (token) headers.set('Authorization', `Bearer ${token}`);
        else if (key) headers.set('x-admin-key', key);

        await fetch('/api/v1/admin/auth/logout', {
          method: 'POST',
          cache: 'no-store',
          keepalive: true,
          headers,
        }).catch(() => null);
      }
    } finally {
      setIsLoggingOut(false);
    }
  }, [clearAdminSession, queryClient]);

  const logoutAll = useCallback(async () => {
    setIsLoggingOut(true);
    const token = getStoredAdminToken()?.trim();
    const key = getStoredAdminKey()?.trim();

    await queryClient.cancelQueries({ queryKey: ['admin'] }).catch(() => null);

    try {
      if (token || key) {
        const headers = new Headers({ 'Content-Type': 'application/json' });
        if (token) headers.set('Authorization', `Bearer ${token}`);
        else if (key) headers.set('x-admin-key', key);

        await fetch('/api/v1/admin/auth/logout-all', {
          method: 'POST',
          cache: 'no-store',
          keepalive: true,
          headers,
          body: JSON.stringify({ includeCurrent: true }),
        }).catch(() => null);
      }
    } finally {
      clearAdminSession();
      setIsLoggingOut(false);
    }
  }, [clearAdminSession, queryClient]);

  return {
    adminKey,
    admin,
    session,
    hasAdminUsers,
    isAuthenticated,
    isVerifying,
    isLoggingOut,
    loginWithPassword,
    loginWithMasterKey,
    login,
    logout,
    logoutAll,
    refreshAuth,
  };
}

export function useAdminOverview(enabled = true) {
  return useQuery<AdminOverviewStats>({
    queryKey: ['admin', 'overview'],
    queryFn: async () => {
      const res = await adminFetch('/api/v1/admin/overview');
      return unwrapApiResponse<AdminOverviewStats>(res, 'Failed to load admin overview');
    },
    enabled: Boolean(enabled && hasAdminCredentials()),
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
    enabled: Boolean(enabled && hasAdminCredentials()),
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
  apiKey?: string;
  publishableKey?: string;
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
    enabled: Boolean(hasAdminCredentials() && projectId),
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
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'projects'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'overview'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'project-inspect', vars.id] });
    },
  });
}

export function useDeleteProjectMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (projectId: string): Promise<{ id: string; deleted: boolean }> => {
      const res = await adminFetch(`/api/v1/admin/projects/${encodeURIComponent(projectId)}`, {
        method: 'DELETE',
      });
      return unwrapApiResponse<{ id: string; deleted: boolean }>(res, 'Failed to delete project');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'projects'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'overview'] });
    },
  });
}

export function useAdminProjectInspect(projectId: string | null) {
  return useQuery<AdminProjectInspectData>({
    queryKey: ['admin', 'project-inspect', projectId],
    queryFn: async () => {
      const res = await adminFetch(
        `/api/v1/admin/projects/${encodeURIComponent(projectId!)}/inspect`,
      );
      const raw = await unwrapApiResponse<Record<string, unknown>>(
        res,
        'Failed to inspect project telemetry',
      );
      const rawSms =
        (raw.recentTransactions as Array<Record<string, unknown>> | undefined) ??
        (raw.recentSms as Array<Record<string, unknown>> | undefined) ??
        (raw.recentLedger as Array<Record<string, unknown>> | undefined) ??
        [];
      const recentSms: AdminProjectInspectLedgerItem[] = rawSms.map((item) => ({
        id: String(item.id ?? ''),
        provider: String(item.provider ?? ''),
        trxId: String(item.trxId ?? ''),
        amount: Number(item.amount ?? 0),
        senderNumber: String(item.senderNumber ?? ''),
        status: String(item.status ?? ''),
        createdAt: String(item.smsReceivedAt ?? item.createdAt ?? ''),
      }));
      return {
        project: raw.project as AdminProjectSummary,
        wallets: (raw.wallets as AdminProjectInspectWallet[]) ?? [],
        recentSms,
        recentOrders:
          (raw.recentOrders as AdminProjectInspectOrderItem[]) ??
          (raw.orders as AdminProjectInspectOrderItem[]) ??
          [],
      };
    },
    enabled: Boolean(hasAdminCredentials() && projectId),
    retry: false,
  });
}

export function useAdminWebhooks(enabled = true) {
  return useQuery<WebhookDeliverySummary[]>({
    queryKey: ['admin', 'webhooks'],
    queryFn: async () => {
      const res = await adminFetch('/api/v1/admin/webhooks');
      return unwrapApiResponse<WebhookDeliverySummary[]>(res, 'Failed to load webhook audit logs');
    },
    enabled: Boolean(enabled && hasAdminCredentials()),
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
    enabled: Boolean(enabled && hasAdminCredentials()),
    retry: false,
    refetchInterval: 8_000,
  });
}

export function useAdminSimulateMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload?: {
      provider?: string;
      amount?: number;
      trxId?: string;
      merchantId?: string;
    }) => {
      const res = await adminFetch('/api/v1/realtime/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload || {}),
      });
      return unwrapApiResponse(res, 'Failed to simulate MFS SMS transaction');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin'] });
    },
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

export function useAdminSystemHealth(enabled = true) {
  return useQuery<AdminSystemHealth>({
    queryKey: ['admin', 'system', 'health'],
    queryFn: async () => {
      const res = await adminFetch('/api/v1/admin/system/health');
      const raw = await unwrapApiResponse<Record<string, unknown>>(
        res,
        'Failed to load system health diagnostics',
      );
      const rawTables = raw.tables;
      let tables: AdminSystemTableStatus[] = [];
      if (Array.isArray(rawTables)) {
        tables = rawTables as AdminSystemTableStatus[];
      } else if (rawTables && typeof rawTables === 'object') {
        tables = Object.entries(rawTables as Record<string, unknown>).map(([name, val]) => {
          if (typeof val === 'boolean') {
            return { name, exists: val };
          }
          if (val && typeof val === 'object') {
            const obj = val as { exists?: boolean; rowCount?: number };
            return { name, exists: Boolean(obj.exists), rowCount: obj.rowCount };
          }
          return { name, exists: Boolean(val) };
        });
      }
      const missingTables = Array.isArray(raw.missingTables)
        ? (raw.missingTables as string[])
        : tables.filter((t) => !t.exists).map((t) => t.name);

      return {
        environment: String(raw.environment ?? 'production'),
        simulatorEnabled: Boolean(raw.simulatorEnabled),
        r2Configured: Boolean(raw.r2Configured),
        pushHubConfigured: Boolean(
          raw.pushHubConfigured ?? raw.durableObjectConfigured ?? raw.selfHostedWsConfigured,
        ),
        fcmConfigured: Boolean(raw.fcmConfigured ?? raw.fcmV1Configured),
        schemaHealthy:
          typeof raw.schemaHealthy === 'boolean'
            ? raw.schemaHealthy
            : missingTables.length === 0,
        missingTables,
        tables,
        checkedAt: typeof raw.checkedAt === 'string' ? raw.checkedAt : undefined,
      };
    },
    enabled: Boolean(enabled && hasAdminCredentials()),
    retry: false,
    refetchInterval: 30_000,
  });
}

export function useEnsureAdminSchemaMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const res = await adminFetch('/api/v1/admin/system/ensure-schema', {
        method: 'POST',
      });
      return unwrapApiResponse<{ repaired?: boolean; tables?: AdminSystemTableStatus[] }>(
        res,
        'Schema verification & repair failed',
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'system', 'health'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'releases'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'auth', 'security'] });
    },
  });
}

export function useAdminSecurityState(enabled = true) {
  return useQuery<AdminSecurityState>({
    queryKey: ['admin', 'auth', 'security'],
    queryFn: async () => {
      const res = await adminFetch('/api/v1/admin/auth/security');
      const raw = await unwrapApiResponse<Record<string, unknown>>(
        res,
        'Failed to load admin security state',
      );
      const adminUsers =
        (raw.adminUsers as AdminUserProfile[]) ??
        (raw.users as AdminUserProfile[]) ??
        [];
      const rawSessions = (raw.sessions as AdminAuthSessionInfo[]) ?? [];
      const sessions = rawSessions.map((s) => ({
        ...s,
        email: s.email ?? s.adminEmail ?? null,
      }));
      const rawAuditLogs = (raw.auditLogs as AdminAuditLogItem[]) ?? [];
      const auditLogs = rawAuditLogs.map((l) => ({
        ...l,
        actorId: l.actorId ?? l.adminUserId ?? null,
        actorEmail: l.actorEmail ?? l.adminEmail ?? null,
        details: l.details ?? l.metadataJson ?? null,
      }));
      return {
        hasAdminUsers:
          typeof raw.hasAdminUsers === 'boolean' ? raw.hasAdminUsers : adminUsers.length > 0,
        currentAdmin: (raw.currentAdmin as AdminUserProfile | null) ?? null,
        currentSession: (raw.currentSession as AdminAuthSessionInfo | null) ?? null,
        adminUsers,
        sessions,
        auditLogs,
      };
    },
    enabled: Boolean(enabled && hasAdminCredentials()),
    retry: false,
    refetchInterval: 15_000,
  });
}

export function useBootstrapAdminMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: {
      email: string;
      fullName: string;
      password: string;
    }): Promise<AdminUserProfile> => {
      const res = await adminFetch('/api/v1/admin/auth/bootstrap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      return unwrapApiResponse<AdminUserProfile>(
        res,
        'Failed to bootstrap admin account',
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'auth'] });
    },
  });
}

export function useRevokeAdminSessionMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (sessionId: string) => {
      const res = await adminFetch(
        `/api/v1/admin/auth/sessions/${encodeURIComponent(sessionId)}`,
        { method: 'DELETE' },
      );
      return unwrapApiResponse(res, 'Failed to revoke admin session');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'auth', 'security'] });
    },
  });
}

export function useCreateAdminUserMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: {
      email: string;
      fullName: string;
      role: 'SUPER_ADMIN' | 'ADMIN_OPERATOR';
      password?: string;
    }): Promise<{
      user: AdminUserProfile;
      temporaryPassword?: string;
      password?: string;
      generatedPassword?: string;
    }> => {
      const res = await adminFetch('/api/v1/admin/auth/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const raw = await unwrapApiResponse<Record<string, unknown>>(
        res,
        'Failed to create admin user',
      );
      const user = (raw.user as AdminUserProfile | undefined) ?? (raw as unknown as AdminUserProfile);
      return {
        user,
        temporaryPassword:
          (raw.temporaryPassword as string | undefined) ??
          (raw.generatedPassword as string | undefined) ??
          (raw.password as string | undefined),
      };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'auth', 'security'] });
    },
  });
}

export function useUpdateAdminUserMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      updates,
    }: {
      id: string;
      updates: {
        fullName?: string;
        role?: 'SUPER_ADMIN' | 'ADMIN_OPERATOR';
        isActive?: boolean;
        resetPassword?: boolean | string;
        password?: string;
      };
    }): Promise<{
      user?: AdminUserProfile;
      temporaryPassword?: string;
      password?: string;
      generatedPassword?: string;
    }> => {
      const body: Record<string, unknown> = {};
      if (updates.fullName !== undefined) body.fullName = updates.fullName;
      if (updates.role !== undefined) body.role = updates.role;
      if (updates.isActive !== undefined) body.isActive = updates.isActive;
      if (updates.resetPassword !== undefined) {
        body.resetPassword = updates.resetPassword;
      } else if (updates.password !== undefined) {
        body.resetPassword = updates.password;
      }

      const res = await adminFetch(`/api/v1/admin/auth/users/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      return unwrapApiResponse<{
        user?: AdminUserProfile;
        temporaryPassword?: string;
        password?: string;
        generatedPassword?: string;
      }>(res, 'Failed to update admin account');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'auth', 'security'] });
    },
  });
}

export interface MessagingProviderCapability {
  provider: string;
  configured: boolean;
  priority: number;
  inCooldown: boolean;
  cooldownUntil?: string;
}

export interface AdminMessagingStatus {
  sms: MessagingProviderCapability[];
  email?: MessagingProviderCapability[];
  push: {
    selfHostedWsConfigured?: boolean;
    fcmV1Configured: boolean;
    projectId: string | null;
    fallbackPollingIntervalSec?: number;
  };
  otp: {
    sentLast24h: number;
    verifiedLast24h: number;
  };
}

export interface MessagingAttempt {
  provider: string;
  ok: boolean;
  statusCode?: number;
  error?: string;
  quotaExhausted?: boolean;
  skippedDueToCooldown?: boolean;
  latencyMs: number;
}

export interface TestSmsPayload {
  to: string;
  message: string;
}

export interface TestSmsResponse {
  dispatched: boolean;
  provider?: string;
  attempts: MessagingAttempt[];
}

export interface TestPushPayload {
  merchantId: string;
  title: string;
  body: string;
}

export interface TestPushResponse {
  sentCount: number;
  wsDelivered?: number;
  fcmDelivered?: number;
  activeSockets?: number;
}

export function useAdminMessagingStatus(enabled = true) {
  return useQuery<AdminMessagingStatus>({
    queryKey: ['admin', 'messaging', 'status'],
    queryFn: async () => {
      const res = await adminFetch('/api/v1/admin/messaging/status');
      return unwrapApiResponse<AdminMessagingStatus>(res, 'Failed to load messaging status');
    },
    enabled: Boolean(enabled && hasAdminCredentials()),
    retry: false,
    refetchInterval: 15_000,
  });
}

export function useSendTestSms() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: TestSmsPayload): Promise<TestSmsResponse> => {
      const res = await adminFetch('/api/v1/admin/messaging/test-sms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      return unwrapApiResponse<TestSmsResponse>(res, 'Failed to dispatch test SMS');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'messaging', 'status'] });
    },
  });
}

export function useSendTestPush() {
  return useMutation({
    mutationFn: async (payload: TestPushPayload): Promise<TestPushResponse> => {
      const res = await adminFetch('/api/v1/admin/messaging/test-push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      return unwrapApiResponse<TestPushResponse>(res, 'Failed to dispatch test push');
    },
  });
}

export interface AppReleaseItem {
  id: string;
  platform: string;
  versionCode: number;
  versionName: string;
  minSupportedVersionCode: number;
  mandatory: boolean;
  releaseNotes: string;
  fileName: string;
  sha256: string;
  sizeBytes: number;
  isActive: boolean;
  downloadUrl: string;
  createdAt: string;
}

export interface AdminReleasesResponse {
  r2Configured: boolean;
  releases: AppReleaseItem[];
}

export interface ReleaseBroadcastResult {
  merchantsTargeted: number;
  totalDelivered: number;
  wsDelivered: number;
  fcmDelivered: number;
}

export interface PublishReleaseResult {
  release: AppReleaseItem;
  broadcast?: ReleaseBroadcastResult;
}

export function useAdminReleases(enabled = true) {
  return useQuery<AdminReleasesResponse>({
    queryKey: ['admin', 'releases'],
    queryFn: async () => {
      const res = await adminFetch('/api/v1/admin/releases');
      return unwrapApiResponse<AdminReleasesResponse>(res, 'Failed to load app releases');
    },
    enabled: Boolean(enabled && hasAdminCredentials()),
    retry: false,
    refetchInterval: 30_000,
  });
}

export function usePublishAppRelease() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (formData: FormData): Promise<PublishReleaseResult> => {
      const res = await adminFetch('/api/v1/admin/releases', {
        method: 'POST',
        body: formData,
      });
      return unwrapApiResponse<PublishReleaseResult>(res, 'Failed to publish APK release');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'releases'] });
    },
  });
}

export function useBroadcastAppRelease() {
  return useMutation({
    mutationFn: async (releaseId: string): Promise<ReleaseBroadcastResult> => {
      const res = await adminFetch(`/api/v1/admin/releases/${encodeURIComponent(releaseId)}/broadcast`, {
        method: 'POST',
      });
      return unwrapApiResponse<ReleaseBroadcastResult>(res, 'Failed to broadcast app update');
    },
  });
}

export function useUpdateAppRelease() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      patch,
    }: {
      id: string;
      patch: {
        mandatory?: boolean;
        minSupportedVersionCode?: number;
        releaseNotes?: string;
        isActive?: boolean;
      };
    }): Promise<AppReleaseItem> => {
      const res = await adminFetch(`/api/v1/admin/releases/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      return unwrapApiResponse<AppReleaseItem>(res, 'Failed to update release metadata');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'releases'] });
    },
  });
}

export function useDeleteAppRelease() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (releaseId: string): Promise<{ id: string; deleted: boolean }> => {
      const res = await adminFetch(`/api/v1/admin/releases/${encodeURIComponent(releaseId)}`, {
        method: 'DELETE',
      });
      return unwrapApiResponse<{ id: string; deleted: boolean }>(res, 'Failed to delete release');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'releases'] });
    },
  });
}
