import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { authFetch, getAuthToken, unwrapApiResponse } from '@/shared/utils/api';
import { getSetupLockHeaders } from './useSetupLock';
import type { VerificationMode } from '@/features/checkout/useCheckout';

export type MerchantReceiptPolicy =
  | 'OFFLINE_OPTIONAL'
  | 'ALWAYS_OPTIONAL'
  | 'ALWAYS_REQUIRED'
  | 'DISABLED';

export interface EnabledModulesConfig {
  ecommerce_fulfillment: boolean;
  phone_otp: boolean;
  telegram_alerts: boolean;
}

export type MerchantAccountMode = 'STANDALONE' | 'WEBHOOK_CONNECTED';

export interface MerchantProfile {
  id: string;
  storeName: string;
  slug: string;
  webhookUrl: string;
  webhookSecret: string;
  gracePeriodMinutes: number;
  accountMode?: MerchantAccountMode;
  ignoreStorefrontSync?: boolean;
  deviceApiKeyHash?: string;
  fcmToken?: string | null;
  lastSeenAt?: string | null;
  isActive: boolean;
  verificationMode: VerificationMode;
  allowBaseAmountFallback: boolean;
  receiptPolicy: MerchantReceiptPolicy;
  lateSmsAutoApprove: boolean;
  enabledModules: EnabledModulesConfig;
  allowedCallbackOrigins: string[];
  apiKeyPrefix?: string | null;
  publishableKey?: string | null;
  telegramConfigured?: boolean;
  telegramChatId?: string | null;
  createdAt: string;
  updatedAt?: string;
}

export interface UpdateMerchantSettingsDTO {
  storeName?: string;
  slug?: string;
  webhookUrl?: string;
  gracePeriodMinutes?: number;
  accountMode?: MerchantAccountMode;
  ignoreStorefrontSync?: boolean;
  verificationMode?: VerificationMode;
  allowBaseAmountFallback?: boolean;
  receiptPolicy?: MerchantReceiptPolicy;
  lateSmsAutoApprove?: boolean;
  enabledModules?: Partial<EnabledModulesConfig>;
  allowedCallbackOrigins?: string[];
  telegramBotToken?: string | null;
  telegramChatId?: string | null;
}

export type WebhookDeliveryStatus = 'DELIVERED' | 'FAILED' | 'RETRYING';

export interface WebhookDeliveryView {
  id: string;
  merchantId: string;
  eventType: string;
  externalOrderId: string;
  payloadJson: string;
  attemptCount: number;
  status: WebhookDeliveryStatus;
  nextRetryAt?: string | number | null;
  deliveredAt?: string | number | null;
  lastAttemptAt?: string | number | null;
  responseStatus?: number | null;
  responseBody?: string | null;
}

export interface MerchantWebhooksResponse {
  items: WebhookDeliveryView[];
  total: number;
  limit: number;
  offset: number;
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
        headers: {
          'Content-Type': 'application/json',
          ...getSetupLockHeaders(),
        },
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
    mutationFn: async (
      target: 'WEBHOOK_SECRET' | 'DEVICE_API_KEY' | 'DEVICE_KEY' | 'API_KEY' | 'BOTH' = 'WEBHOOK_SECRET',
    ) => {
      const normalizedTarget = target === 'DEVICE_KEY' ? 'DEVICE_API_KEY' : target;
      const res = await authFetch('/api/v1/merchants/keys/rotate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getSetupLockHeaders(),
        },
        body: JSON.stringify({ target: normalizedTarget }),
      });

      const data = await unwrapApiResponse<{
        webhookSecret?: string;
        deviceKey?: string;
        apiKey?: string;
        apiKeyPrefix?: string;
        publishableKey?: string;
        newWebhookSecret?: string;
        newDeviceApiKey?: string;
      }>(res, 'Failed to rotate keys');

      return {
        webhookSecret: data.webhookSecret ?? data.newWebhookSecret,
        deviceKey: data.deviceKey ?? data.newDeviceApiKey,
        apiKey: data.apiKey,
        apiKeyPrefix: data.apiKeyPrefix,
        publishableKey: data.publishableKey,
      };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['merchant'] });
    },
  });
}

export function useTestWebhookPing() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (webhookUrl?: string) => {
      const res = await authFetch('/api/v1/merchants/webhook/test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getSetupLockHeaders(),
        },
        body: JSON.stringify(webhookUrl ? { webhookUrl } : {}),
      });

      return unwrapApiResponse<{
        delivered?: boolean;
        status?: string;
        responseStatus?: number;
        message?: string;
      }>(res, 'Target endpoint failed to acknowledge test ping');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['merchant-webhooks'] });
    },
  });
}

export function useMerchantWebhooks(
  status: WebhookDeliveryStatus | 'ALL' = 'ALL',
  options?: { enabled?: boolean },
) {
  return useQuery<MerchantWebhooksResponse>({
    queryKey: ['merchant-webhooks', status],
    queryFn: async () => {
      const params = new URLSearchParams({ status, limit: '25', offset: '0' });
      const res = await authFetch(`/api/v1/merchants/webhooks?${params.toString()}`);
      const data = await unwrapApiResponse<MerchantWebhooksResponse>(
        res,
        'Failed to fetch webhook deliveries',
      );
      return {
        items: data.items ?? [],
        total: Number(data.total ?? data.items?.length ?? 0),
        limit: Number(data.limit ?? 25),
        offset: Number(data.offset ?? 0),
      };
    },
    enabled: Boolean(getAuthToken()) && (options?.enabled ?? true),
    staleTime: 10_000,
  });
}

export function useReplayMerchantWebhook() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (deliveryId: string) => {
      const res = await authFetch(
        `/api/v1/merchants/webhooks/${encodeURIComponent(deliveryId)}/replay`,
        {
          method: 'POST',
          headers: {
            ...getSetupLockHeaders(),
          },
        },
      );
      return unwrapApiResponse<{ status?: string; responseStatus?: number }>(
        res,
        'Failed to replay webhook delivery',
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['merchant-webhooks'] });
    },
  });
}
