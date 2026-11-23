import type { Env } from '../shared/types';

export type RouterChannel = 'email' | 'sms' | 'image' | 'database';

export type EmailProviderId =
  | 'resend'
  | 'brevo'
  | 'sendpulse'
  | 'aws_ses'
  | 'sendgrid'
  | 'cloudflare'
  | 'apps_script'
  | 'custom_webhook';

export type SmsProviderId =
  | 'fcm'
  | 'bulksmsbd'
  | 'ssl_wireless'
  | 'twilio'
  | 'custom_webhook';

export type ImageProviderId =
  | 'r2'
  | 'imgbb'
  | 'supabase'
  | 'mongodb'
  | 'd1';

export type DatabaseProviderId =
  | 'd1'
  | 'kv'
  | 'supabase'
  | 'mongodb'
  | 'turso';

export interface ProviderAttempt {
  provider: string;
  ok: boolean;
  statusCode?: number;
  error?: string;
  quotaExhausted?: boolean;
  skippedDueToCooldown?: boolean;
  latencyMs: number;
}

export interface RouterDispatchResponse<T = unknown> {
  success: boolean;
  channel: RouterChannel;
  providerUsed: string | null;
  fallbackTriggered: boolean;
  attempts: ProviderAttempt[];
  data?: T;
  error?: string;
}

export interface ProviderAdapter<TInput, TOutput> {
  id: string;
  isConfigured: (env: Env) => boolean;
  execute: (env: Env, input: TInput) => Promise<{
    ok: boolean;
    statusCode?: number;
    data?: TOutput;
    error?: string;
    quotaExhausted?: boolean;
  }>;
}

export interface ProviderCapability {
  provider: string;
  configured: boolean;
  priority: number;
  inCooldown: boolean;
  cooldownUntil?: string;
}

export interface RouterHealthSnapshot {
  timestamp: string;
  channels: Record<RouterChannel, ProviderCapability[]>;
}
