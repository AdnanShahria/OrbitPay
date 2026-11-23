import type { AppDb } from '../db/client';
import type { Env } from '../shared/types';
import {
  buildChannelCapabilities,
  executeWithFallback,
  resolveProviderOrder,
} from './secrets';
import type {
  ProviderAdapter,
  ProviderCapability,
  RouterDispatchResponse,
  SmsProviderId,
} from './types';

export const DEFAULT_SMS_PROVIDERS: readonly SmsProviderId[] = [
  'bulksmsbd',
  'ssl_wireless',
  'twilio',
  'fcm',
  'custom_webhook',
];

export interface SmsOrPushRequest {
  to?: string; // Phone number for SMS providers
  message: string;
  title?: string; // Push notification title
  fcmToken?: string; // Target Android FCM registration token
  data?: Record<string, string>;
  preferredProvider?: SmsProviderId;
}

export interface SmsOrPushResult {
  dispatched: boolean;
  externalId?: string;
}

async function parseErrorText(res: Response): Promise<string> {
  try {
    return (await res.text()).slice(0, 400);
  } catch {
    return res.statusText || `HTTP ${res.status}`;
  }
}

function normalizePhoneBD(phone: string): string {
  const digits = phone.replace(/[^0-9+]/g, '');
  if (digits.startsWith('+')) return digits.slice(1);
  if (digits.startsWith('01') && digits.length === 11) return `88${digits}`;
  return digits;
}

const SMS_ADAPTERS: Record<string, ProviderAdapter<SmsOrPushRequest, SmsOrPushResult>> = {
  fcm: {
    id: 'fcm',
    isConfigured: (env) => Boolean(env.FCM_SERVER_KEY),
    execute: async (env, req) => {
      if (!req.fcmToken) {
        return { ok: false, statusCode: 400, error: 'Missing fcmToken for FCM push channel' };
      }

      const res = await fetch('https://fcm.googleapis.com/fcm/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `key=${env.FCM_SERVER_KEY}`,
        },
        body: JSON.stringify({
          to: req.fcmToken,
          notification: {
            title: req.title || 'ORBIT Payment Hub',
            body: req.message,
            sound: 'default',
          },
          data: req.data || {},
          priority: 'high',
        }),
        signal: AbortSignal.timeout(5000),
      });

      if (!res.ok) {
        return { ok: false, statusCode: res.status, error: await parseErrorText(res) };
      }
      const json = (await res.json().catch(() => ({}))) as { message_id?: string };
      return { ok: true, statusCode: res.status, data: { dispatched: true, externalId: json.message_id } };
    },
  },

  bulksmsbd: {
    id: 'bulksmsbd',
    isConfigured: (env) => Boolean(env.BULKSMSBD_API_KEY && env.BULKSMSBD_SENDER_ID),
    execute: async (env, req) => {
      if (!req.to) {
        return { ok: false, statusCode: 400, error: 'Missing recipient phone number (to)' };
      }

      const params = new URLSearchParams({
        api_key: env.BULKSMSBD_API_KEY!,
        type: 'text',
        number: normalizePhoneBD(req.to),
        senderid: env.BULKSMSBD_SENDER_ID!,
        message: req.message,
      });

      const res = await fetch(`https://bulksmsbd.net/api/smsapi?${params.toString()}`, {
        method: 'POST',
        signal: AbortSignal.timeout(8000),
      });

      const body = (await res.json().catch(() => ({}))) as {
        response_code?: number;
        error_message?: string;
        success_message?: string;
      };
      if (!res.ok || (body.response_code && body.response_code !== 202)) {
        return {
          ok: false,
          statusCode: res.status,
          error: body.error_message || `BulkSMSBD code ${body.response_code || res.status}`,
        };
      }
      return { ok: true, statusCode: res.status, data: { dispatched: true } };
    },
  },

  ssl_wireless: {
    id: 'ssl_wireless',
    isConfigured: (env) => Boolean(env.SSL_WIRELESS_API_TOKEN && env.SSL_WIRELESS_SID),
    execute: async (env, req) => {
      if (!req.to) {
        return { ok: false, statusCode: 400, error: 'Missing recipient phone number (to)' };
      }

      const res = await fetch('https://smsplus.sslwireless.com/api/v3/send-sms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_token: env.SSL_WIRELESS_API_TOKEN,
          sid: env.SSL_WIRELESS_SID,
          msisdn: normalizePhoneBD(req.to),
          sms: req.message,
          csms_id: `orbit_${Date.now()}`,
        }),
        signal: AbortSignal.timeout(8000),
      });

      if (!res.ok) {
        return { ok: false, statusCode: res.status, error: await parseErrorText(res) };
      }
      const json = (await res.json().catch(() => ({}))) as { status?: string; error_message?: string };
      if (json.status && json.status.toUpperCase() === 'FAILED') {
        return { ok: false, statusCode: 400, error: json.error_message || 'SSL Wireless failed' };
      }
      return { ok: true, statusCode: res.status, data: { dispatched: true } };
    },
  },

  twilio: {
    id: 'twilio',
    isConfigured: (env) =>
      Boolean(env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_FROM_NUMBER),
    execute: async (env, req) => {
      if (!req.to) {
        return { ok: false, statusCode: 400, error: 'Missing recipient phone number (to)' };
      }

      const auth = btoa(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`);
      const form = new URLSearchParams({
        To: req.to.startsWith('+') ? req.to : `+${normalizePhoneBD(req.to)}`,
        From: env.TWILIO_FROM_NUMBER!,
        Body: req.message,
      });

      const res = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}/Messages.json`,
        {
          method: 'POST',
          headers: {
            Authorization: `Basic ${auth}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: form.toString(),
          signal: AbortSignal.timeout(8000),
        }
      );

      if (!res.ok) {
        return { ok: false, statusCode: res.status, error: await parseErrorText(res) };
      }
      const json = (await res.json().catch(() => ({}))) as { sid?: string };
      return { ok: true, statusCode: res.status, data: { dispatched: true, externalId: json.sid } };
    },
  },

  custom_webhook: {
    id: 'custom_webhook',
    isConfigured: (env) => Boolean(env.CUSTOM_SMS_WEBHOOK_URL),
    execute: async (env, req) => {
      const res = await fetch(env.CUSTOM_SMS_WEBHOOK_URL!, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req),
        signal: AbortSignal.timeout(8000),
      });

      if (!res.ok) {
        return { ok: false, statusCode: res.status, error: await parseErrorText(res) };
      }
      return { ok: true, statusCode: res.status, data: { dispatched: true } };
    },
  },
};

/**
 * Unified SMS & Push Router
 * Automatically selects configured SMS/Push providers and falls back across providers on error or quota exhaustion.
 */
export async function routeSmsOrPush(
  env: Env,
  request: SmsOrPushRequest,
  options?: { db?: AppDb; callerId?: string }
): Promise<RouterDispatchResponse<SmsOrPushResult>> {
  // If caller provided an FCM token without a phone number, prioritize FCM first
  const preferred =
    request.preferredProvider || (request.fcmToken && !request.to ? 'fcm' : undefined);

  const defaultOrder =
    request.fcmToken && !request.to
      ? (['fcm', 'custom_webhook'] as const)
      : request.to
        ? (['bulksmsbd', 'ssl_wireless', 'twilio', 'custom_webhook'] as const)
        : DEFAULT_SMS_PROVIDERS;

  const priorityOrder = resolveProviderOrder(env.SMS_PROVIDER_ORDER, defaultOrder, preferred);

  return executeWithFallback({
    channel: 'sms',
    env,
    input: request,
    adapters: SMS_ADAPTERS,
    priorityOrder,
    db: options?.db,
    callerId: options?.callerId,
  });
}

export function getSmsProviderCapabilities(env: Env): ProviderCapability[] {
  const order = resolveProviderOrder(env.SMS_PROVIDER_ORDER, DEFAULT_SMS_PROVIDERS);
  return buildChannelCapabilities('sms', env, SMS_ADAPTERS, order);
}
