import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { authFetch, getAuthToken, unwrapApiResponse } from '@/shared/utils/api';

export interface MerchantProfile {
  id: string;
  storeName: string;
  webhookUrl: string;
  webhookSecret: string;
  gracePeriodMinutes: number;
  deviceApiKeyHash: string;
  fcmToken?: string | null;
  lastSeenAt?: string | null;
  isActive: boolean;
  createdAt: string;
}

export interface UpdateMerchantSettingsDTO {
  storeName?: string;
  webhookUrl?: string;
  gracePeriodMinutes?: number;
}

export function useMerchant(merchantId?: string) {
  return useQuery<MerchantProfile>({
    queryKey: ['merchant', merchantId || 'me'],
    queryFn: async () => {
      const qs = merchantId ? `?merchantId=${encodeURIComponent(merchantId)}` : '';
      const res = await authFetch(`/api/v1/merchants/profile${qs}`);
      return unwrapApiResponse<MerchantProfile>(res, 'Failed to fetch merchant profile');
    },
    enabled: Boolean(getAuthToken()),
    staleTime: 30_000,
  });
}

export function useUpdateMerchantSettings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: UpdateMerchantSettingsDTO) => {
      const res = await authFetch('/api/v1/merchants/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      return unwrapApiResponse<MerchantProfile>(res, 'Failed to update merchant settings');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['merchant'] });
    },
  });
}

export function useRotateWebhookSecret() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (target: 'WEBHOOK_SECRET' | 'DEVICE_API_KEY' | 'DEVICE_KEY' | 'BOTH' = 'WEBHOOK_SECRET') => {
      const normalizedTarget = target === 'DEVICE_KEY' ? 'DEVICE_API_KEY' : target;
      const res = await authFetch('/api/v1/merchants/keys/rotate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target: normalizedTarget }),
      });

      const data = await unwrapApiResponse<{
        webhookSecret?: string;
        deviceKey?: string;
        newWebhookSecret?: string;
        newDeviceApiKey?: string;
      }>(res, 'Failed to rotate keys');

      return {
        webhookSecret: data.webhookSecret ?? data.newWebhookSecret,
        deviceKey: data.deviceKey ?? data.newDeviceApiKey,
      };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['merchant'] });
    },
  });
}

export function useTestWebhookPing() {
  return useMutation({
    mutationFn: async (webhookUrl: string) => {
      const res = await authFetch('/api/v1/merchants/webhook/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ webhookUrl }),
      });

      return unwrapApiResponse<{ status?: number; message?: string }>(
        res,
        'Target endpoint failed to acknowledge test ping',
      );
    },
  });
}
