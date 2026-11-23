import { eq, and, lte, isNotNull } from 'drizzle-orm';
import type { AppDb } from '../../db/client';
import {
  webhookDeliveries,
  merchants,
  merchantDevices,
  type MerchantRecord,
} from '../../db/schema';
import { routeSmsOrPush } from '../../router/sms';
import { generateSecureToken } from '../../shared/crypto';
import type { Env } from '../../shared/types';
import { buildWebhookPayload, generateHmacSignature } from './webhook.service';

const RETRY_INTERVALS_MS = [
  60 * 1000,         // Attempt 1: 1 min
  5 * 60 * 1000,     // Attempt 2: 5 min
  15 * 60 * 1000,    // Attempt 3: 15 min
  60 * 60 * 1000,    // Attempt 4: 1 hour
  24 * 60 * 60 * 1000 // Attempt 5: 24 hours
];

export interface DispatchResult {
  success: boolean;
  statusCode?: number;
  deliveryId: string;
  error?: string;
}

/**
 * Dispatches an authenticated webhook payload to the merchant's external storefront.
 * Handles timeouts, saves audit logs in webhook_deliveries, and configures retries.
 */
export async function dispatchWebhook(
  db: AppDb,
  merchant: MerchantRecord,
  event: string,
  data: Record<string, unknown>,
  attemptCount = 1,
  existingDeliveryId?: string,
  targetUrlOverride?: string | null
): Promise<DispatchResult> {
  const deliveryId = existingDeliveryId || `whd_${generateSecureToken(16)}`;
  const externalOrderId = String(data.externalOrderId || data.orderId || 'UNKNOWN');
  const payloadObj = buildWebhookPayload(event, data);
  const payloadJson = JSON.stringify(payloadObj);
  const targetUrl = (targetUrlOverride || merchant.webhookUrl || '').trim();

  // Skip new webhook dispatches when no callback URL is configured (e.g. during testing)
  if (!targetUrl && !existingDeliveryId) {
    return {
      success: false,
      deliveryId: 'skipped_no_webhook_url',
      error: 'No webhook URL configured (skipped)',
    };
  }

  let signature = '';
  try {
    signature = await generateHmacSignature(payloadJson, merchant.webhookSecret);
  } catch (err: any) {
    console.error(`[Webhook] HMAC generation failed for merchant ${merchant.id}:`, err);
  }

  let responseCode: number | null = null;
  let responseBody: string | null = null;
  let isSuccess = false;

  // Only attempt HTTP dispatch if URL is valid
  if (targetUrl && targetUrl.startsWith('http')) {
    try {
      const response = await fetch(targetUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'OrbitPaymentEngine/1.0',
          'X-Orbit-Signature': signature,
          'X-Orbit-Event-Id': payloadObj.eventId,
          'X-Orbit-Delivery-Attempt': String(attemptCount),
        },
        body: payloadJson,
        signal: AbortSignal.timeout(10000), // 10 second timeout
      });

      responseCode = response.status;
      const text = await response.text();
      responseBody = text.substring(0, 1000); // Truncate body for DB storage

      if (response.status >= 200 && response.status < 300) {
        isSuccess = true;
      }
    } catch (err: any) {
      responseBody = `Fetch error: ${err.message || 'Connection timeout or network failure'}`;
    }
  } else {
    responseBody = `Invalid or unconfigured webhook URL: ${targetUrl}`;
  }

  const now = new Date();
  let nextRetryAt: Date | null = null;
  let status: 'DELIVERED' | 'FAILED' | 'RETRYING' = 'DELIVERED';

  if (!isSuccess) {
    if (attemptCount < RETRY_INTERVALS_MS.length) {
      status = 'RETRYING';
      const delayMs = RETRY_INTERVALS_MS[attemptCount - 1];
      nextRetryAt = new Date(now.getTime() + delayMs);
    } else {
      status = 'FAILED';
    }
  }

  // Update or insert into webhook_deliveries
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
    error: isSuccess ? undefined : (responseBody || 'Dispatch failed'),
  };
}

/**
 * Worker / cron process that runs through pending retry deliveries.
 */
export async function processWebhookRetries(
  db: AppDb
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
    const merchantResult = await db.select().from(merchants).where(eq(merchants.id, delivery.merchantId)).limit(1);
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
      const targetUrlOverride =
        typeof innerData?.storeCallbackUrl === 'string' && innerData.storeCallbackUrl.startsWith('http')
          ? innerData.storeCallbackUrl
          : undefined;
      const res = await dispatchWebhook(
        db,
        merchant,
        delivery.eventType,
        innerData,
        delivery.attemptCount + 1,
        delivery.id,
        targetUrlOverride
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

/**
 * Sends a push notification to the merchant's Android companion app via the unified SMS/Push router.
 * Delegates provider selection and fallback to `backend/src/router/sms.ts`.
 */
export async function sendFcmPush(
  fcmServerKeyOrEnv: string | Env | undefined,
  fcmToken: string | null | undefined,
  title: string,
  body: string,
  data?: Record<string, string>
): Promise<boolean> {
  if (!fcmServerKeyOrEnv || !fcmToken) {
    return false;
  }

  const env =
    typeof fcmServerKeyOrEnv === 'string'
      ? ({ FCM_SERVER_KEY: fcmServerKeyOrEnv } as Env)
      : fcmServerKeyOrEnv;

  const res = await routeSmsOrPush(env, {
    fcmToken,
    title,
    message: body,
    data,
    preferredProvider: 'fcm',
  });

  return res.success;
}

/**
 * Dispatches an FCM push notification to all registered tokens for a merchant
 * (both legacy merchant.fcmToken and active merchant_devices.fcmToken rows).
 */
export async function sendPushToMerchantDevices(
  db: AppDb,
  fcmServerKeyOrEnv: string | Env | undefined,
  merchant: MerchantRecord,
  title: string,
  body: string,
  data?: Record<string, string>
): Promise<number> {
  if (!fcmServerKeyOrEnv) {
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

  let sentCount = 0;
  await Promise.allSettled(
    Array.from(tokens).map(async (token) => {
      const ok = await sendFcmPush(fcmServerKeyOrEnv, token, title, body, data);
      if (ok) sentCount++;
    })
  );

  return sentCount;
}
