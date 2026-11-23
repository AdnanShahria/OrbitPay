import {
  routerRequest,
  type ProviderCapability,
  type RouterCallerAuth,
  type RouterDispatchResponse,
} from './client';

export interface SendSmsInput {
  to?: string;
  message: string;
  title?: string;
  fcmToken?: string;
  data?: Record<string, string>;
  preferredProvider?: 'fcm' | 'bulksmsbd' | 'ssl_wireless' | 'twilio' | 'custom_webhook';
}

export interface SendSmsResult {
  dispatched: boolean;
  externalId?: string;
}

/**
 * Dispatches an SMS or Push Notification via `/api/v1/router/sms/send`.
 * Provider credentials remain strictly on the backend with automatic failover.
 */
export function sendSms(
  input: SendSmsInput,
  auth?: RouterCallerAuth
): Promise<RouterDispatchResponse<SendSmsResult>> {
  return routerRequest<RouterDispatchResponse<SendSmsResult>>('/sms/send', {
    method: 'POST',
    body: JSON.stringify(input),
    auth,
  });
}

export async function getSmsProviders(auth?: RouterCallerAuth): Promise<ProviderCapability[]> {
  const res = await routerRequest<{ success: boolean; data: ProviderCapability[] }>(
    '/sms/providers',
    { method: 'GET', auth }
  );
  return res.data;
}
