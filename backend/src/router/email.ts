import type { AppDb } from '../db/client';
import { bufferToHex, signHmacSha256, toExactArrayBuffer } from '../shared/crypto';
import type { Env } from '../shared/types';
import {
  buildChannelCapabilities,
  executeWithFallback,
  resolveProviderOrder,
} from './secrets';
import type {
  EmailProviderId,
  ProviderAdapter,
  ProviderCapability,
  RouterDispatchResponse,
} from './types';

export const DEFAULT_EMAIL_PROVIDERS: readonly EmailProviderId[] = [
  'resend',
  'brevo',
  'sendpulse',
  'aws_ses',
  'sendgrid',
  'cloudflare',
  'apps_script',
  'custom_webhook',
];

export interface EmailSendRequest {
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  from?: string;
  fromName?: string;
  replyTo?: string;
  preferredProvider?: EmailProviderId;
}

export interface EmailSendResult {
  messageId?: string;
  accepted: boolean;
}

interface NormalizedEmailPayload {
  toList: string[];
  subject: string;
  html?: string;
  text?: string;
  fromEmail: string;
  fromName: string;
  replyTo?: string;
}

// Per-isolate cached SendPulse OAuth access token
let cachedSendPulseToken: { token: string; expiresAt: number } | null = null;

function normalizeEmailPayload(env: Env, req: EmailSendRequest): NormalizedEmailPayload {
  const toList = (Array.isArray(req.to) ? req.to : [req.to])
    .map((addr) => addr.trim())
    .filter(Boolean);

  return {
    toList,
    subject: req.subject,
    html: req.html,
    text: req.text,
    fromEmail: req.from || env.EMAIL_FROM || 'noreply@payment.orbitsaas.cloud',
    fromName: req.fromName || env.EMAIL_FROM_NAME || 'ORBIT Payment Hub',
    replyTo: req.replyTo,
  };
}

async function parseErrorText(res: Response): Promise<string> {
  try {
    const txt = await res.text();
    return txt.slice(0, 400);
  } catch {
    return res.statusText || `HTTP ${res.status}`;
  }
}

async function sha256Hex(data: string): Promise<string> {
  const bytes = new TextEncoder().encode(data);
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return bufferToHex(hash);
}

async function hmacSha256Raw(key: ArrayBuffer | Uint8Array | string, data: string): Promise<ArrayBuffer> {
  const enc = new TextEncoder();
  const rawKey =
    typeof key === 'string'
      ? toExactArrayBuffer(enc.encode(key))
      : key instanceof Uint8Array
        ? toExactArrayBuffer(key)
        : key;
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    rawKey,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  return crypto.subtle.sign('HMAC', cryptoKey, enc.encode(data));
}

async function signAwsSesV4Headers(opts: {
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  host: string;
  path: string;
  body: string;
}): Promise<Record<string, string>> {
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);
  const service = 'ses';
  const payloadHash = await sha256Hex(opts.body);

  const canonicalHeaders =
    `content-type:application/json\n` +
    `host:${opts.host}\n` +
    `x-amz-date:${amzDate}\n`;
  const signedHeaders = 'content-type;host;x-amz-date';

  const canonicalRequest = [
    'POST',
    opts.path,
    '',
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');

  const credentialScope = `${dateStamp}/${opts.region}/${service}/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    await sha256Hex(canonicalRequest),
  ].join('\n');

  const kDate = await hmacSha256Raw(`AWS4${opts.secretAccessKey}`, dateStamp);
  const kRegion = await hmacSha256Raw(kDate, opts.region);
  const kService = await hmacSha256Raw(kRegion, service);
  const kSigning = await hmacSha256Raw(kService, 'aws4_request');
  const signature = bufferToHex(await hmacSha256Raw(kSigning, stringToSign));

  return {
    'Content-Type': 'application/json',
    'X-Amz-Date': amzDate,
    Authorization: `AWS4-HMAC-SHA256 Credential=${opts.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
  };
}

const EMAIL_ADAPTERS: Record<string, ProviderAdapter<NormalizedEmailPayload, EmailSendResult>> = {
  resend: {
    id: 'resend',
    isConfigured: (env) => Boolean(env.RESEND_API_KEY),
    execute: async (env, payload) => {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${env.RESEND_API_KEY}`,
        },
        body: JSON.stringify({
          from: `${payload.fromName} <${payload.fromEmail}>`,
          to: payload.toList,
          subject: payload.subject,
          html: payload.html,
          text: payload.text,
          reply_to: payload.replyTo,
        }),
        signal: AbortSignal.timeout(10000),
      });

      if (!res.ok) {
        return { ok: false, statusCode: res.status, error: await parseErrorText(res) };
      }
      const json = (await res.json().catch(() => ({}))) as { id?: string };
      return { ok: true, statusCode: res.status, data: { accepted: true, messageId: json.id } };
    },
  },

  brevo: {
    id: 'brevo',
    isConfigured: (env) => Boolean(env.BREVO_API_KEY),
    execute: async (env, payload) => {
      const res = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'api-key': env.BREVO_API_KEY!,
        },
        body: JSON.stringify({
          sender: { name: payload.fromName, email: payload.fromEmail },
          to: payload.toList.map((email) => ({ email })),
          subject: payload.subject,
          htmlContent: payload.html,
          textContent: payload.text,
          replyTo: payload.replyTo ? { email: payload.replyTo } : undefined,
        }),
        signal: AbortSignal.timeout(10000),
      });

      if (!res.ok) {
        return { ok: false, statusCode: res.status, error: await parseErrorText(res) };
      }
      const json = (await res.json().catch(() => ({}))) as { messageId?: string };
      return { ok: true, statusCode: res.status, data: { accepted: true, messageId: json.messageId } };
    },
  },

  sendpulse: {
    id: 'sendpulse',
    isConfigured: (env) => Boolean(env.SENDPULSE_CLIENT_ID && env.SENDPULSE_CLIENT_SECRET),
    execute: async (env, payload) => {
      let token =
        cachedSendPulseToken && Date.now() < cachedSendPulseToken.expiresAt
          ? cachedSendPulseToken.token
          : null;

      if (!token) {
        const authRes = await fetch('https://api.sendpulse.com/oauth/access_token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            grant_type: 'client_credentials',
            client_id: env.SENDPULSE_CLIENT_ID,
            client_secret: env.SENDPULSE_CLIENT_SECRET,
          }),
          signal: AbortSignal.timeout(8000),
        });

        if (!authRes.ok) {
          return {
            ok: false,
            statusCode: authRes.status,
            error: `SendPulse OAuth failed: ${await parseErrorText(authRes)}`,
          };
        }

        const authData = (await authRes.json()) as { access_token?: string; expires_in?: number };
        if (!authData.access_token) {
          return { ok: false, statusCode: 401, error: 'SendPulse OAuth returned no access_token' };
        }
        token = authData.access_token;
        cachedSendPulseToken = {
          token,
          expiresAt: Date.now() + Math.max(60, (authData.expires_in || 3600) - 60) * 1000,
        };
      }

      const res = await fetch('https://api.sendpulse.com/smtp/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          email: {
            html: payload.html || payload.text || '',
            text: payload.text || '',
            subject: payload.subject,
            from: { name: payload.fromName, email: payload.fromEmail },
            to: payload.toList.map((email) => ({ email })),
          },
        }),
        signal: AbortSignal.timeout(10000),
      });

      if (res.status === 401) {
        cachedSendPulseToken = null;
      }
      if (!res.ok) {
        return { ok: false, statusCode: res.status, error: await parseErrorText(res) };
      }
      const json = (await res.json().catch(() => ({}))) as { id?: string };
      return { ok: true, statusCode: res.status, data: { accepted: true, messageId: json.id } };
    },
  },

  aws_ses: {
    id: 'aws_ses',
    isConfigured: (env) => Boolean(env.AWS_SES_ACCESS_KEY_ID && env.AWS_SES_SECRET_ACCESS_KEY),
    execute: async (env, payload) => {
      const region = env.AWS_SES_REGION || 'us-east-1';
      const host = `email.${region}.amazonaws.com`;
      const path = '/v2/email/outbound-emails';

      const body = JSON.stringify({
        FromEmailAddress: `${payload.fromName} <${payload.fromEmail}>`,
        Destination: { ToAddresses: payload.toList },
        ReplyToAddresses: payload.replyTo ? [payload.replyTo] : undefined,
        Content: {
          Simple: {
            Subject: { Data: payload.subject, Charset: 'UTF-8' },
            Body: {
              ...(payload.html ? { Html: { Data: payload.html, Charset: 'UTF-8' } } : {}),
              ...(payload.text ? { Text: { Data: payload.text, Charset: 'UTF-8' } } : {}),
            },
          },
        },
      });

      const headers = await signAwsSesV4Headers({
        accessKeyId: env.AWS_SES_ACCESS_KEY_ID!,
        secretAccessKey: env.AWS_SES_SECRET_ACCESS_KEY!,
        region,
        host,
        path,
        body,
      });

      const res = await fetch(`https://${host}${path}`, {
        method: 'POST',
        headers,
        body,
        signal: AbortSignal.timeout(10000),
      });

      if (!res.ok) {
        return { ok: false, statusCode: res.status, error: await parseErrorText(res) };
      }
      const json = (await res.json().catch(() => ({}))) as { MessageId?: string };
      return { ok: true, statusCode: res.status, data: { accepted: true, messageId: json.MessageId } };
    },
  },

  sendgrid: {
    id: 'sendgrid',
    isConfigured: (env) => Boolean(env.SENDGRID_API_KEY),
    execute: async (env, payload) => {
      const content: Array<{ type: string; value: string }> = [];
      if (payload.text) content.push({ type: 'text/plain', value: payload.text });
      if (payload.html) content.push({ type: 'text/html', value: payload.html });
      if (content.length === 0) content.push({ type: 'text/plain', value: payload.subject });

      const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${env.SENDGRID_API_KEY}`,
        },
        body: JSON.stringify({
          personalizations: [{ to: payload.toList.map((email) => ({ email })) }],
          from: { email: payload.fromEmail, name: payload.fromName },
          reply_to: payload.replyTo ? { email: payload.replyTo } : undefined,
          subject: payload.subject,
          content,
        }),
        signal: AbortSignal.timeout(10000),
      });

      if (!res.ok) {
        return { ok: false, statusCode: res.status, error: await parseErrorText(res) };
      }
      return {
        ok: true,
        statusCode: res.status,
        data: { accepted: true, messageId: res.headers.get('x-message-id') || undefined },
      };
    },
  },

  cloudflare: {
    id: 'cloudflare',
    isConfigured: (env) =>
      Boolean(env.SEND_EMAIL || env.CLOUDFLARE_EMAIL_API_KEY || env.MAILCHANNELS_API_KEY),
    execute: async (env, payload) => {
      if (env.SEND_EMAIL) {
        try {
          const res = await env.SEND_EMAIL.send({
            from: { email: payload.fromEmail, name: payload.fromName },
            to: payload.toList.length === 1 ? payload.toList[0] : payload.toList,
            subject: payload.subject,
            ...(payload.text ? { text: payload.text } : {}),
            ...(payload.html ? { html: payload.html } : {}),
            ...(payload.replyTo ? { replyTo: payload.replyTo } : {}),
          });
          return {
            ok: true,
            statusCode: 200,
            data: {
              accepted: true,
              messageId: (res as { messageId?: string } | undefined)?.messageId,
            },
          };
        } catch (err) {
          return {
            ok: false,
            error: err instanceof Error ? err.message : 'Cloudflare Email Service send failed',
          };
        }
      }

      const apiKey = env.CLOUDFLARE_EMAIL_API_KEY || env.MAILCHANNELS_API_KEY;
      const content: Array<{ type: string; value: string }> = [];
      if (payload.text) content.push({ type: 'text/plain', value: payload.text });
      if (payload.html) content.push({ type: 'text/html', value: payload.html });
      if (content.length === 0) content.push({ type: 'text/plain', value: payload.subject });

      const res = await fetch('https://api.mailchannels.net/tx/v1/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(apiKey ? { 'X-Api-Key': apiKey } : {}),
        },
        body: JSON.stringify({
          personalizations: [{ to: payload.toList.map((email) => ({ email })) }],
          from: { email: payload.fromEmail, name: payload.fromName },
          reply_to: payload.replyTo ? { email: payload.replyTo } : undefined,
          subject: payload.subject,
          content,
        }),
        signal: AbortSignal.timeout(10000),
      });

      if (!res.ok) {
        return { ok: false, statusCode: res.status, error: await parseErrorText(res) };
      }
      return { ok: true, statusCode: res.status, data: { accepted: true } };
    },
  },

  apps_script: {
    id: 'apps_script',
    isConfigured: (env) => Boolean(env.APPS_SCRIPT_EMAIL_URL),
    execute: async (env, payload) => {
      const res = await fetch(env.APPS_SCRIPT_EMAIL_URL!, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: payload.toList.join(','),
          subject: payload.subject,
          htmlBody: payload.html || '',
          body: payload.text || '',
          fromName: payload.fromName,
          replyTo: payload.replyTo,
        }),
        signal: AbortSignal.timeout(12000),
      });

      if (!res.ok) {
        return { ok: false, statusCode: res.status, error: await parseErrorText(res) };
      }
      return { ok: true, statusCode: res.status, data: { accepted: true } };
    },
  },

  custom_webhook: {
    id: 'custom_webhook',
    isConfigured: (env) => Boolean(env.CUSTOM_EMAIL_WEBHOOK_URL),
    execute: async (env, payload) => {
      const bodyStr = JSON.stringify(payload);
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (env.CUSTOM_EMAIL_WEBHOOK_SECRET) {
        headers['X-Orbit-Signature'] = await signHmacSha256(
          bodyStr,
          env.CUSTOM_EMAIL_WEBHOOK_SECRET
        );
      }

      const res = await fetch(env.CUSTOM_EMAIL_WEBHOOK_URL!, {
        method: 'POST',
        headers,
        body: bodyStr,
        signal: AbortSignal.timeout(10000),
      });

      if (!res.ok) {
        return { ok: false, statusCode: res.status, error: await parseErrorText(res) };
      }
      return { ok: true, statusCode: res.status, data: { accepted: true } };
    },
  },
};

/**
 * Intelligent Email Router
 * Selects the best configured email service from backend secrets and automatically
 * falls back across remaining services if a provider hits quota limits or errors.
 */
export async function routeEmail(
  env: Env,
  request: EmailSendRequest,
  options?: { db?: AppDb; callerId?: string }
): Promise<RouterDispatchResponse<EmailSendResult>> {
  const normalized = normalizeEmailPayload(env, request);
  const priorityOrder = resolveProviderOrder(
    env.EMAIL_PROVIDER_ORDER,
    DEFAULT_EMAIL_PROVIDERS,
    request.preferredProvider
  );

  return executeWithFallback({
    channel: 'email',
    env,
    input: normalized,
    adapters: EMAIL_ADAPTERS,
    priorityOrder,
    db: options?.db,
    callerId: options?.callerId,
  });
}

export function getEmailProviderCapabilities(env: Env): ProviderCapability[] {
  const order = resolveProviderOrder(env.EMAIL_PROVIDER_ORDER, DEFAULT_EMAIL_PROVIDERS);
  return buildChannelCapabilities('email', env, EMAIL_ADAPTERS, order);
}
