/// <reference types="@cloudflare/workers-types/2023-07-01" />
import type { AppDb } from '../db/client';
import type { MerchantRecord } from '../db/schema';

export interface SendEmailBinding {
  send(message: {
    from: string | { email: string; name?: string };
    to: string | string[];
    subject: string;
    text?: string;
    html?: string;
    replyTo?: string;
  }): Promise<{ messageId?: string } | void>;
}

export interface Env {
  DB: D1Database;
  ASSETS?: Fetcher;
  R2_BUCKET?: R2Bucket;
  KV?: KVNamespace;
  SEND_EMAIL?: SendEmailBinding;
  PUSH_HUB?: DurableObjectNamespace;

  // Core Platform Secrets
  MASTER_ADMIN_KEY?: string;
  ENCRYPTION_PEPPER?: string;
  JWT_SECRET?: string;
  ENVIRONMENT?: string;
  PRODUCTION_DOMAIN?: string;

  // Email Service Router Secrets & Priority
  EMAIL_PROVIDER_ORDER?: string;
  EMAIL_FROM?: string;
  EMAIL_FROM_NAME?: string;
  ORBITMAIL_API_KEY?: string;
  ORBITMAIL_URL?: string;
  ORBITMAIL_FROM?: string;
  RESEND_API_KEY?: string;
  BREVO_API_KEY?: string;
  SENDPULSE_CLIENT_ID?: string;
  SENDPULSE_CLIENT_SECRET?: string;
  SENDGRID_API_KEY?: string;
  AWS_SES_ACCESS_KEY_ID?: string;
  AWS_SES_SECRET_ACCESS_KEY?: string;
  AWS_SES_REGION?: string;
  CLOUDFLARE_EMAIL_API_KEY?: string;
  MAILCHANNELS_API_KEY?: string;
  APPS_SCRIPT_EMAIL_URL?: string;
  CUSTOM_EMAIL_WEBHOOK_URL?: string;
  CUSTOM_EMAIL_WEBHOOK_SECRET?: string;

  // SMS & Push Notification Router Secrets & Priority
  SMS_PROVIDER_ORDER?: string;
  FCM_SERVICE_ACCOUNT_JSON?: string;
  FCM_PROJECT_ID?: string;
  FCM_SERVER_KEY?: string; // Deprecated: legacy FCM API removed; use FCM_SERVICE_ACCOUNT_JSON
  OTP_TTL_SECONDS?: string;
  BULKSMSBD_API_KEY?: string;
  BULKSMSBD_SENDER_ID?: string;
  SSL_WIRELESS_API_TOKEN?: string;
  SSL_WIRELESS_SID?: string;
  TWILIO_ACCOUNT_SID?: string;
  TWILIO_AUTH_TOKEN?: string;
  TWILIO_FROM_NUMBER?: string;
  CUSTOM_SMS_WEBHOOK_URL?: string;

  // Image Storage Router Secrets & Priority
  IMAGE_PROVIDER_ORDER?: string;
  IMGBB_API_KEY?: string;
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  SUPABASE_STORAGE_BUCKET?: string;
  MONGODB_DATA_API_URL?: string;
  MONGODB_API_KEY?: string;
  MONGODB_DATABASE?: string;

  // Database Router Secrets & Priority
  DATABASE_PROVIDER_ORDER?: string;
  TURSO_DATABASE_URL?: string;
  TURSO_AUTH_TOKEN?: string;
}

export interface AppVariables {
  db: AppDb;
  merchant?: MerchantRecord;
  merchantId?: string;
  userId?: string;
  sessionId?: string;
  userRole?: string;
}

export type AppContextEnv = {
  Bindings: Env;
  Variables: AppVariables;
};
