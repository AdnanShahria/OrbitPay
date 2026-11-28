import { eq, and, lte, isNotNull, inArray } from 'drizzle-orm';
import type { AppDb } from '../../db/client';
import {
  webhookDeliveries,
  merchants,
  merchantDevices,
  merchantProjects,
  type MerchantRecord,
} from '../../db/schema';
import { pushToMerchantWebSockets } from '../../router/push-hub';
import { routeSmsOrPush } from '../../router/sms';
import { generateSecureToken } from '../../shared/crypto';
import { checkSafeWebhookUrl, parseAllowedOrigins } from '../../shared/ssrf';
import type { Env } from '../../shared/types';
import {
  buildWebhookPayload,
  generateHmacSignature,
  generateHmacSignatureV2,
} from './webhook.service';

const RETRY_INTERVALS_MS = [
  60 * 1000,         // Retry 1: 1 min
  5 * 60 * 1000,     // Retry 2: 5 min
  15 * 60 * 1000,    // Retry 3: 15 min
  60 * 60 * 1000,    // Retry 4: 1 hour
  24 * 60 * 60 * 1000 // Retry 5: 24 hours
];

export interface DispatchResult {
  success: boolean;
  statusCode?: number;
  deliveryId: string;
  eventId?: string;
  error?: string;
}

export interface DynamicPushAction {
  id: string;
  label: string;
  style?: 'primary' | 'secondary' | 'danger';
  webhookEvent?: string;
}

export interface DynamicPushPayload {
  event: string;
  paymentIntentId?: string;
  externalRefId: string;
  appName: string;
  appDomain?: string;
  category?: string;
  referenceLabel?: string;
  title: string;
  subtitle?: string;
  amountFormatted: string;
  provider?: string;
  paymentStatus: string;
  adminDeepLink?: string;
  actions?: DynamicPushAction[];
  extraData?: Record<string, string>;
}

function sanitizeResponseBody(raw: string): string {
  return raw
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 500);
}

/**
 * Dispatches an authenticated webhook payload to the merchant's external storefront.
 * Enforces SSRF protection, disables HTTP redirects, emits v1+v2 HMAC signatures,
 * preserves eventId & payloadJson on retries, and records audit logs in webhook_deliveries.
 */
export interface DispatchWebhookOptions {
  projectId?: string | null;
  webhookSecretOverride?: string | null;
  allowedOriginsOverride?: string[];
}

export async function dispatchWebhook(
  db: AppDb,
  merchant: MerchantRecord,
  event: string,
  data: Record<string, unknown>,
  attemptCount = 1,
  existingDeliveryId?: string,
  targetUrlOverride?: string | null,
  env?: Env,
  prebuiltPayloadJson?: string,
  options?: DispatchWebhookOptions
): Promise<DispatchResult> {
  const deliveryId = existingDeliveryId || `whd_${generateSecureToken(16)}`;
  const externalOrderId = String(
    data.externalRefId || data.externalOrderId || data.orderId || 'UNKNOWN'
  );

  let payloadJson: string;
  let eventId: string;
  let timestamp: number;

  if (prebuiltPayloadJson) {
    payloadJson = prebuiltPayloadJson;
    try {
      const parsed = JSON.parse(prebuiltPayloadJson) as {
        eventId?: string;
        timestamp?: number;
      };
      eventId = parsed.eventId || `evt_${generateSecureToken(12)}`;
      timestamp = typeof parsed.timestamp === 'number' ? parsed.timestamp : Date.now();
    } catch {
      const fallback = buildWebhookPayload(event, data);
      payloadJson = JSON.stringify(fallback);
      eventId = fallback.eventId;
      timestamp = fallback.timestamp;
    }
  } else {
    const payloadObj = buildWebhookPayload(event, data);
    payloadJson = JSON.stringify(payloadObj);
    eventId = payloadObj.eventId;
    timestamp = payloadObj.timestamp;
  }

  const targetUrl = (targetUrlOverride || merchant.webhookUrl || '').trim();
  const effectiveSecret = options?.webhookSecretOverride?.trim() || merchant.webhookSecret;

  if (!targetUrl && !existingDeliveryId) {
    return {
      success: false,
      deliveryId: 'skipped_no_webhook_url',
      eventId,
      error: 'No webhook URL configured (skipped)',
    };
  }

  let signature = '';
  let signatureV2 = '';
  try {
    [signature, signatureV2] = await Promise.all([
      generateHmacSignature(payloadJson, effectiveSecret),
      generateHmacSignatureV2(timestamp, payloadJson, effectiveSecret),
    ]);
  } catch (err) {
    console.error(`[Webhook] HMAC generation failed for merchant ${merchant.id}:`, err);
  }

  let responseCode: number | null = null;
  let responseBody: string | null = null;
  let isSuccess = false;

  const allowedOrigins = targetUrlOverride
    ? options?.allowedOriginsOverride ?? parseAllowedOrigins(merchant.allowedCallbackOriginsJson)
    : undefined;
  const ssrfCheck = checkSafeWebhookUrl(targetUrl, env, allowedOrigins);

  if (ssrfCheck.ok && ssrfCheck.url) {
    try {
      const response = await fetch(ssrfCheck.url.toString(), {
        method: 'POST',
        redirect: 'manual',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'OrbitPaymentEngine/2.0',
          'X-Orbit-Event': event,
          'X-Orbit-Event-Id': eventId,
          'X-Orbit-Timestamp': String(timestamp),
          'X-Orbit-Signature': signature,
          'X-Orbit-Signature-V2': signatureV2,
          'X-Orbit-Delivery-Attempt': String(attemptCount),
        },
        body: payloadJson,
        signal: AbortSignal.timeout(10000),
      });

      responseCode = response.status;
      if (response.status >= 300 && response.status < 400) {
        responseBody = `Redirect blocked by SSRF policy (HTTP ${response.status})`;
      } else {
        const text = await response.text().catch(() => '');
        responseBody = sanitizeResponseBody(text);
        if (response.status >= 200 && response.status < 300) {
          isSuccess = true;
        }
      }
    } catch (err: any) {
      responseBody = sanitizeResponseBody(
        `Fetch error: ${err?.message || 'Connection timeout or network failure'}`
      );
    }
  } else {
    responseBody = sanitizeResponseBody(
      `Blocked webhook URL: ${ssrfCheck.reason || 'Invalid URL'}`
    );
  }

  const now = new Date();
  let nextRetryAt: Date | null = null;
  let status: 'DELIVERED' | 'FAILED' | 'RETRYING' = 'DELIVERED';

  if (!isSuccess) {
    if (attemptCount <= RETRY_INTERVALS_MS.length) {
      status = 'RETRYING';
      const delayMs = RETRY_INTERVALS_MS[attemptCount - 1];
      nextRetryAt = new Date(now.getTime() + delayMs);
    } else {
      status = 'FAILED';
    }
  }

  if (existingDeliveryId) {
    await db
      .update(webhookDeliveries)
      .set({
        attemptCount,
        status,
        nextRetryAt,
        deliveredAt: isSuccess ? now : null,
        lastAttemptAt: now,
        responseStatus: responseCode,
        responseBody,
      })
      .where(eq(webhookDeliveries.id, existingDeliveryId));
  } else {
    await db.insert(webhookDeliveries).values({
      id: deliveryId,
      merchantId: merchant.id,
      projectId: options?.projectId ?? (typeof data.projectId === 'string' ? data.projectId : null),
      eventType: event,
      externalOrderId,
      payloadJson,
      signature,
      attemptCount,
      status,
      nextRetryAt,
      deliveredAt: isSuccess ? now : null,
      lastAttemptAt: now,
      responseStatus: responseCode,
      responseBody,
    });
  }

  return {
    success: isSuccess,
    statusCode: responseCode || undefined,
    deliveryId,
    eventId,
    error: isSuccess ? undefined : responseBody || 'Dispatch failed',
  };
}

/**
 * Worker / cron process that runs through pending retry deliveries,
 * preserving the original immutable payloadJson & eventId.
 */
export async function processWebhookRetries(
  db: AppDb,
  env?: Env
): Promise<{ processed: number; succeeded: number; failed: number }> {
  const now = new Date();
  const pendingDeliveries = await db
    .select()
    .from(webhookDeliveries)
    .where(and(eq(webhookDeliveries.status, 'RETRYING'), lte(webhookDeliveries.nextRetryAt, now)))
    .limit(20);

  let succeeded = 0;
  let failed = 0;

  for (const delivery of pendingDeliveries) {
    const merchantResult = await db
      .select()
      .from(merchants)
      .where(eq(merchants.id, delivery.merchantId))
      .limit(1);
    const merchant = merchantResult[0];

    if (!merchant || !merchant.isActive) {
      await db
        .update(webhookDeliveries)
        .set({ status: 'FAILED', responseBody: 'Merchant not found or inactive' })
        .where(eq(webhookDeliveries.id, delivery.id));
      failed++;
      continue;
    }

    try {
      const parsedData = JSON.parse(delivery.payloadJson);
      const innerData = parsedData.data || parsedData;
      const resolvedProjectId =
        delivery.projectId ??
        (typeof innerData?.projectId === 'string' ? innerData.projectId : undefined);
      const projectRow = resolvedProjectId
        ? (
            await db
              .select()
              .from(merchantProjects)
              .where(
                and(
                  eq(merchantProjects.id, resolvedProjectId),
                  eq(merchantProjects.merchantId, merchant.id)
                )
              )
              .limit(1)
          )[0]
        : undefined;

      const candidateOverride =
        typeof innerData?.callbackUrl === 'string' && innerData.callbackUrl
          ? innerData.callbackUrl
          : typeof innerData?.storeCallbackUrl === 'string' && innerData.storeCallbackUrl
            ? innerData.storeCallbackUrl
            : projectRow?.webhookUrl?.trim()
              ? projectRow.webhookUrl.trim()
              : undefined;

      const res = await dispatchWebhook(
        db,
        merchant,
        delivery.eventType,
        innerData,
        delivery.attemptCount + 1,
        delivery.id,
        candidateOverride,
        env,
        delivery.payloadJson,
        projectRow
          ? {
              projectId: projectRow.id,
              webhookSecretOverride: projectRow.webhookSecret,
              allowedOriginsOverride: parseAllowedOrigins(projectRow.allowedCallbackOriginsJson),
            }
          : undefined
      );

      if (res.success) {
        succeeded++;
      } else {
        failed++;
      }
    } catch {
      failed++;
    }
  }

  return { processed: pendingDeliveries.length, succeeded, failed };
}

function normalizePushEnv(fcmServerKeyOrEnv: string | Env | undefined): Env | null {
  if (!fcmServerKeyOrEnv) {
    return null;
  }
  if (typeof fcmServerKeyOrEnv === 'string') {
    return { FCM_SERVER_KEY: fcmServerKeyOrEnv } as Env;
  }
  return fcmServerKeyOrEnv;
}

async function sendFcmPushDetailed(
  fcmServerKeyOrEnv: string | Env | undefined,
  fcmToken: string | null | undefined,
  title: string,
  body: string,
  data?: Record<string, string>
): Promise<{ ok: boolean; unregistered: boolean }> {
  const env = normalizePushEnv(fcmServerKeyOrEnv);
  if (!env || !fcmToken) {
    return { ok: false, unregistered: false };
  }

  const res = await routeSmsOrPush(env, {
    fcmToken,
    title,
    message: body,
    data,
    preferredProvider: 'fcm',
  });

  const fcmAttempt = res.attempts.find((attempt) => attempt.provider === 'fcm');
  const unregistered = Boolean(
    fcmAttempt &&
      !fcmAttempt.ok &&
      (fcmAttempt.statusCode === 404 ||
        fcmAttempt.error?.toUpperCase().includes('UNREGISTERED'))
  );

  return { ok: res.success, unregistered };
}

export async function sendFcmPush(
  fcmServerKeyOrEnv: string | Env | undefined,
  fcmToken: string | null | undefined,
  title: string,
  body: string,
  data?: Record<string, string>
): Promise<boolean> {
  const res = await sendFcmPushDetailed(fcmServerKeyOrEnv, fcmToken, title, body, data);
  return res.ok;
}

export interface DetailedPushResult {
  totalDelivered: number;
  wsDelivered: number;
  fcmDelivered: number;
  activeSockets: number;
}

function resolvePushEvent(data?: Record<string, string>): string {
  if (data?.event) return data.event;
  if (data?.trxId) return 'payment.verified';
  if (data?.type === 'ADMIN_TEST_PUSH') return 'ADMIN_TEST_PUSH';
  return 'notification';
}

async function sendFcmToMerchantTokens(
  db: AppDb,
  env: Env,
  merchant: MerchantRecord,
  title: string,
  body: string,
  data?: Record<string, string>
): Promise<number> {
  if (!env.FCM_SERVICE_ACCOUNT_JSON?.trim()) {
    return 0;
  }

  const deviceRows = await db
    .select({ fcmToken: merchantDevices.fcmToken })
    .from(merchantDevices)
    .where(
      and(
        eq(merchantDevices.merchantId, merchant.id),
        eq(merchantDevices.isActive, true),
        isNotNull(merchantDevices.fcmToken)
      )
    );

  const tokens = new Set<string>();
  if (merchant.fcmToken) {
    tokens.add(merchant.fcmToken);
  }
  for (const row of deviceRows) {
    if (row.fcmToken) {
      tokens.add(row.fcmToken);
    }
  }

  if (tokens.size === 0) {
    return 0;
  }

  let fcmDelivered = 0;
  const unregisteredTokens: string[] = [];

  await Promise.allSettled(
    Array.from(tokens).map(async (token) => {
      const res = await sendFcmPushDetailed(env, token, title, body, data);
      if (res.ok) {
        fcmDelivered++;
      } else if (res.unregistered) {
        unregisteredTokens.push(token);
      }
    })
  );

  if (unregisteredTokens.length > 0) {
    try {
      await db
        .update(merchantDevices)
        .set({ fcmToken: null })
        .where(
          and(
            eq(merchantDevices.merchantId, merchant.id),
            inArray(merchantDevices.fcmToken, unregisteredTokens)
          )
        );

      if (merchant.fcmToken && unregisteredTokens.includes(merchant.fcmToken)) {
        await db
          .update(merchants)
          .set({ fcmToken: null })
          .where(eq(merchants.id, merchant.id));
      }
    } catch (cleanupErr) {
      console.warn('[FCM Token Cleanup Error]:', cleanupErr);
    }
  }

  return fcmDelivered;
}

/**
 * Dispatches a push notification across Cloudflare Durable Object WebSocket hub and FCM HTTP v1.
 */
export async function sendPushToMerchantDevicesDetailed(
  db: AppDb,
  fcmServerKeyOrEnv: string | Env | undefined,
  merchant: MerchantRecord,
  title: string,
  body: string,
  data?: Record<string, string>
): Promise<DetailedPushResult> {
  const env = normalizePushEnv(fcmServerKeyOrEnv);
  if (!env) {
    return {
      totalDelivered: 0,
      wsDelivered: 0,
      fcmDelivered: 0,
      activeSockets: 0,
    };
  }

  const [wsRes, fcmDelivered] = await Promise.all([
    pushToMerchantWebSockets(env, merchant.id, {
      event: resolvePushEvent(data),
      title,
      body,
      data,
    }),
    sendFcmToMerchantTokens(db, env, merchant, title, body, data),
  ]);

  return {
    totalDelivered: wsRes.delivered + fcmDelivered,
    wsDelivered: wsRes.delivered,
    fcmDelivered,
    activeSockets: wsRes.activeSockets,
  };
}

/**
 * Backward-compatible wrapper returning total push deliveries for a merchant.
 */
export async function sendPushToMerchantDevices(
  db: AppDb,
  fcmServerKeyOrEnv: string | Env | undefined,
  merchant: MerchantRecord,
  title: string,
  body: string,
  data?: Record<string, string>
): Promise<number> {
  const res = await sendPushToMerchantDevicesDetailed(
    db,
    fcmServerKeyOrEnv,
    merchant,
    title,
    body,
    data
  );
  return res.totalDelivered;
}

/**
 * Dispatches a universal, server-driven multi-vertical push payload to merchant devices
 * (Android Companion + Web Portal) with zero vertical hardcoding.
 */
export async function sendDynamicPushToMerchantDevices(
  db: AppDb,
  env: Env | undefined,
  merchant: MerchantRecord,
  payload: DynamicPushPayload
): Promise<DetailedPushResult> {
  const pushTitle = `${payload.appName}: ${payload.title}`;
  const bodyParts = [payload.amountFormatted];
  if (payload.provider) bodyParts.push(payload.provider);
  if (payload.subtitle) bodyParts.push(payload.subtitle);
  const pushBody = bodyParts.join(' • ');

  const dataRecord: Record<string, string> = {
    ...(payload.extraData || {}),
    event: payload.event,
    ...(payload.paymentIntentId ? { paymentIntentId: payload.paymentIntentId } : {}),
    externalRefId: payload.externalRefId,
    appName: payload.appName,
    ...(payload.appDomain ? { appDomain: payload.appDomain } : {}),
    ...(payload.category ? { category: payload.category } : {}),
    ...(payload.referenceLabel ? { referenceLabel: payload.referenceLabel } : {}),
    title: payload.title,
    ...(payload.subtitle ? { subtitle: payload.subtitle } : {}),
    amountFormatted: payload.amountFormatted,
    ...(payload.provider ? { provider: payload.provider } : {}),
    paymentStatus: payload.paymentStatus,
    ...(payload.adminDeepLink ? { adminDeepLink: payload.adminDeepLink } : {}),
    actionsJson: JSON.stringify(payload.actions || []),
  };

  return sendPushToMerchantDevicesDetailed(db, env, merchant, pushTitle, pushBody, dataRecord);
}

/**
 * Sends a real-time office alert to the merchant's configured Telegram Bot + Chat ID.
 */
export async function sendTelegramOfficeAlert(
  merchant: MerchantRecord,
  message: string,
  projectOverride?: { telegramBotToken?: string | null; telegramChatId?: string | null } | null
): Promise<boolean> {
  const botToken = projectOverride?.telegramBotToken?.trim() || merchant.telegramBotToken?.trim();
  const chatId = projectOverride?.telegramChatId?.trim() || merchant.telegramChatId?.trim();
  if (!botToken || !chatId) {
    return false;
  }

  try {
    const modules = JSON.parse(merchant.enabledModulesJson || '{}') as {
      telegram_alerts?: boolean;
    };
    if (modules.telegram_alerts === false) {
      return false;
    }
  } catch {
    // Proceed if modules JSON is malformed but token+chatId are present
  }

  try {
    const res = await fetch(`https://api.telegram.org/bot${encodeURIComponent(botToken)}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        disable_web_page_preview: true,
      }),
      signal: AbortSignal.timeout(8000),
    });
    return res.ok;
  } catch (err) {
    console.warn('[Telegram Office Alert Error]:', err);
    return false;
  }
}
