import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { authFetch, getAuthToken, unwrapApiResponse } from '@/shared/utils/api';
import { getSetupLockHeaders } from '@/features/merchants/useSetupLock';

export type ProjectWalletSelectionMode = 'COMMON' | 'SPECIFIC';
export type ProjectAccountMode = 'STANDALONE' | 'WEBHOOK_CONNECTED';
export type ProjectVerificationMode = 'AUTO' | 'PURE_MANUAL';

export interface MerchantSubProject {
  id: string;
  merchantId: string;
  name: string;
  slug: string;
  description: string | null;
  accountMode: ProjectAccountMode;
  verificationMode: ProjectVerificationMode;
  walletSelectionMode: ProjectWalletSelectionMode;
  walletIds: string[];
  ignoreStorefrontSync: boolean;
  webhookUrl: string;
  webhookSecret: string;
  apiKeyPrefix: string | null;
  publishableKey: string | null;
  allowedCallbackOrigins: string[];
  telegramConfigured: boolean;
  telegramChatId: string | null;
  isDefault: boolean;
  isActive: boolean;
  createdAt: string | number;
  updatedAt: string | number;
}

export interface UpdateMerchantProjectPayload {
  name?: string;
  description?: string | null;
  accountMode?: ProjectAccountMode;
  verificationMode?: ProjectVerificationMode;
  walletSelectionMode?: ProjectWalletSelectionMode;
  walletIds?: string[];
  ignoreStorefrontSync?: boolean;
  webhookUrl?: string;
  allowedCallbackOrigins?: string[];
}

export interface RotateProjectKeysResponse {
  projectId: string;
  webhookSecret?: string;
  apiKey?: string;
  apiKeyPrefix?: string;
  publishableKey?: string;
}

export function useMerchantProjects() {
  return useQuery<MerchantSubProject[]>({
    queryKey: ['merchant-projects'],
    queryFn: async () => {
      const res = await authFetch('/api/v1/projects');
      const data = await unwrapApiResponse<MerchantSubProject[]>(
        res,
        'Failed to fetch merchant projects',
      );
      return Array.isArray(data) ? data : [];
    },
    enabled: Boolean(getAuthToken()),
    staleTime: 15_000,
  });
}

export function useUpdateMerchantProjectMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      projectId,
      patch,
    }: {
      projectId: string;
      patch: UpdateMerchantProjectPayload;
    }) => {
      const res = await authFetch(`/api/v1/projects/${encodeURIComponent(projectId)}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...getSetupLockHeaders(),
        },
        body: JSON.stringify(patch),
      });
      return unwrapApiResponse<MerchantSubProject>(res, 'Failed to update project configuration');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['merchant-projects'] });
      queryClient.invalidateQueries({ queryKey: ['payment-links'] });
    },
  });
}

export function useRotateMerchantProjectKeysMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      projectId,
      target = 'all',
    }: {
      projectId: string;
      target?: 'webhook' | 'api' | 'all';
    }) => {
      const res = await authFetch(
        `/api/v1/projects/${encodeURIComponent(projectId)}/keys/rotate`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...getSetupLockHeaders(),
          },
          body: JSON.stringify({ target }),
        },
      );
      return unwrapApiResponse<RotateProjectKeysResponse>(
        res,
        'Failed to rotate project keys',
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['merchant-projects'] });
    },
  });
}
