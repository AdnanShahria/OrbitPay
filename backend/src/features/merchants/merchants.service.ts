import { and, desc, eq, sql } from 'drizzle-orm';
import type { AppDb } from '../../db/client';
import { merchants, webhookDeliveries, type AccountMode, type MerchantRecord } from '../../db/schema';
import {
  generateDeviceApiKey,
  generateMerchantApiKey,
  generatePublishableKey,
  generateSecureToken,
  generateWebhookSecret,
  hashDeviceApiKey,
  hashSha256,
} from '../../shared/crypto';
import { BadRequestError, ConflictError, NotFoundError } from '../../shared/errors';
import { parseAllowedOrigins, validateSafeWebhookUrl } from '../../shared/ssrf';
import {
  ensureUniqueMerchantSlug,
  RESERVED_ROUTE_SEGMENTS,
  resolveAndPersistMerchantSlug,
  toSafeMerchantSlug,
} from '../../shared/slug';
import type { Env } from '../../shared/types';
import { dispatchWebhook } from '../webhooks/webhook.dispatcher';
import type {
  ListMerchantWebhooksQuery,
  RegisterMerchantInput,
  UpdateMerchantSettingsInput,
} from './merchants.schema';

export interface SafeMerchantProfile {
  id: string;
  storeName: string;
  slug: string;
  webhookUrl: string;
  webhookSecret: string;
  gracePeriodMinutes: number;
  fcmToken: string | null;
  lastSeenAt: Date | null;
  isActive: boolean;
  accountMode: AccountMode;
  ignoreStorefrontSync: boolean;
  verificationMode: string;
  allowBaseAmountFallback: boolean;
  receiptPolicy: string;
  lateSmsAutoApprove: boolean;
  enabledModules: Record<string, boolean>;
  allowedCallbackOrigins: string[];
  apiKeyPrefix: string | null;
  publishableKey: string | null;
  telegramConfigured: boolean;
  telegramChatId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface KeyRotationResult {
  merchantId: string;
  newWebhookSecret?: string;
  newDeviceApiKey?: string;
  webhookSecret?: string;
  deviceKey?: string;
  apiKey?: string;
  apiKeyPrefix?: string;
  publishableKey?: string;
}

export interface RegisterMerchantResult {
  merchant: SafeMerchantProfile;
  deviceApiKey: string;
  webhookSecret: string;
  apiKey: string;
  publishableKey: string;
}

function maskWebhookSecret(secret: string): string {
  if (!secret) return '';
  if (secret.length <= 10) return '••••••••';
  const prefix = secret.startsWith('whsec_') ? 'whsec_' : secret.slice(0, 4);
  const suffix = secret.slice(-4);
  return `${prefix}••••••••${suffix}`;
}

function parseEnabledModules(jsonStr?: string | null): Record<string, boolean> {
  try {
    const parsed = jsonStr ? JSON.parse(jsonStr) : {};
    return {
      ecommerce_fulfillment: parsed.ecommerce_fulfillment !== false,
      phone_otp: Boolean(parsed.phone_otp),
      telegram_alerts: Boolean(parsed.telegram_alerts),
    };
  } catch {
    return { ecommerce_fulfillment: true, phone_otp: false, telegram_alerts: false };
  }
}

function toSafeMerchantProfile(m: MerchantRecord): SafeMerchantProfile {
  return {
    id: m.id,
    storeName: m.storeName,
    slug: m.slug || toSafeMerchantSlug(m.storeName),
    webhookUrl: m.webhookUrl,
    webhookSecret: maskWebhookSecret(m.webhookSecret),
    gracePeriodMinutes: m.gracePeriodMinutes,
    fcmToken: m.fcmToken,
    lastSeenAt: m.lastSeenAt,
    isActive: m.isActive,
    accountMode: m.accountMode,
    ignoreStorefrontSync: m.ignoreStorefrontSync,
    verificationMode: m.verificationMode,
    allowBaseAmountFallback: m.allowBaseAmountFallback,
    receiptPolicy: m.receiptPolicy,
    lateSmsAutoApprove: m.lateSmsAutoApprove,
    enabledModules: parseEnabledModules(m.enabledModulesJson),
    allowedCallbackOrigins: parseAllowedOrigins(m.allowedCallbackOriginsJson),
    apiKeyPrefix: m.apiKeyPrefix ?? null,
    publishableKey: m.publishableKey ?? null,
    telegramConfigured: Boolean(m.telegramBotToken && m.telegramChatId),
    telegramChatId: m.telegramChatId ?? null,
    createdAt: m.createdAt,
    updatedAt: m.updatedAt,
  };
}

/**
 * Retrieves merchant profile (sanitizes device API key hash and masks webhookSecret).
 */
export async function getMerchantProfile(
  db: AppDb,
  merchantId: string
): Promise<SafeMerchantProfile> {
  const result = await db.select().from(merchants).where(eq(merchants.id, merchantId)).limit(1);
  const m = result[0];

  if (!m) {
    throw new NotFoundError(`Merchant '${merchantId}' not found`);
  }

  const persistedSlug = await resolveAndPersistMerchantSlug(db, m);
  return toSafeMerchantProfile({ ...m, slug: persistedSlug });
}

/**
 * Updates merchant configurable settings with SSRF validation on webhookUrl and allowedCallbackOrigins.
 */
export async function updateMerchantSettings(
  db: AppDb,
  merchantId: string,
  settings: UpdateMerchantSettingsInput,
  env?: Env
): Promise<SafeMerchantProfile> {
  const existing = await db.select().from(merchants).where(eq(merchants.id, merchantId)).limit(1);
  if (!existing[0]) {
    throw new NotFoundError(`Merchant '${merchantId}' not found`);
  }

  if (settings.webhookUrl && settings.webhookUrl.trim() !== '') {
    validateSafeWebhookUrl(settings.webhookUrl.trim(), env);
  }

  if (settings.allowedCallbackOrigins) {
    for (const origin of settings.allowedCallbackOrigins) {
      validateSafeWebhookUrl(origin, env);
    }
  }

  const currentModules = parseEnabledModules(existing[0].enabledModulesJson);
  const nextModules = settings.enabledModules
    ? { ...currentModules, ...settings.enabledModules }
    : undefined;

  let nextSlug: string | undefined;
  if (settings.slug !== undefined) {
    const normalized = settings.slug.trim().toLowerCase();
    if (RESERVED_ROUTE_SEGMENTS.has(normalized)) {
      throw new BadRequestError(`Merchant handle '${normalized}' is reserved`);
    }
    const existingWithSlug = await db
      .select({ id: merchants.id })
      .from(merchants)
      .where(sql`lower(${merchants.slug}) = ${normalized}`)
      .limit(1);
    if (existingWithSlug[0] && existingWithSlug[0].id !== merchantId) {
      throw new ConflictError(`Merchant handle '${normalized}' is already taken`);
    }
    nextSlug = normalized;
  }

  const now = new Date();
  await db
    .update(merchants)
    .set({
      ...(settings.storeName !== undefined && { storeName: settings.storeName }),
      ...(nextSlug !== undefined && { slug: nextSlug }),
      ...(settings.webhookUrl !== undefined && { webhookUrl: settings.webhookUrl }),
      ...(settings.gracePeriodMinutes !== undefined && {
        gracePeriodMinutes: settings.gracePeriodMinutes,
      }),
      ...(settings.accountMode !== undefined && {
        accountMode: settings.accountMode,
      }),
      ...(settings.ignoreStorefrontSync !== undefined && {
        ignoreStorefrontSync: settings.ignoreStorefrontSync,
      }),
      ...(settings.verificationMode !== undefined && {
        verificationMode: settings.verificationMode,
      }),
      ...(settings.allowBaseAmountFallback !== undefined && {
        allowBaseAmountFallback: settings.allowBaseAmountFallback,
      }),
      ...(settings.receiptPolicy !== undefined && { receiptPolicy: settings.receiptPolicy }),
      ...(settings.lateSmsAutoApprove !== undefined && {
        lateSmsAutoApprove: settings.lateSmsAutoApprove,
      }),
      ...(nextModules !== undefined && { enabledModulesJson: JSON.stringify(nextModules) }),
      ...(settings.allowedCallbackOrigins !== undefined && {
        allowedCallbackOriginsJson: JSON.stringify(
          settings.allowedCallbackOrigins.map((o) => new URL(o).origin)
        ),
      }),
      ...(settings.telegramBotToken !== undefined && {
        telegramBotToken: settings.telegramBotToken?.trim() || null,
      }),
      ...(settings.telegramChatId !== undefined && {
        telegramChatId: settings.telegramChatId?.trim() || null,
      }),
      updatedAt: now,
    })
    .where(eq(merchants.id, merchantId));

  return getMerchantProfile(db, merchantId);
}

/**
 * Rotates merchant webhook secret, companion app device key, and/or server-to-server API key.
 */
export async function rotateKeys(
  db: AppDb,
  merchantId: string,
  target: 'WEBHOOK_SECRET' | 'DEVICE_API_KEY' | 'DEVICE_KEY' | 'API_KEY' | 'BOTH',
  pepper = ''
): Promise<KeyRotationResult> {
  const existing = await db.select().from(merchants).where(eq(merchants.id, merchantId)).limit(1);
  if (!existing[0]) {
    throw new NotFoundError(`Merchant '${merchantId}' not found`);
  }

  const result: KeyRotationResult = { merchantId };
  const updateData: Partial<MerchantRecord> = { updatedAt: new Date() };

  if (target === 'WEBHOOK_SECRET' || target === 'BOTH') {
    const newSecret = generateWebhookSecret();
    updateData.webhookSecret = newSecret;
    result.newWebhookSecret = newSecret;
    result.webhookSecret = newSecret;
  }

  if (target === 'DEVICE_API_KEY' || target === 'DEVICE_KEY' || target === 'BOTH') {
    const rawDeviceKey = generateDeviceApiKey();
    const keyHash = await hashDeviceApiKey(rawDeviceKey, pepper);
    updateData.deviceApiKeyHash = keyHash;
    result.newDeviceApiKey = rawDeviceKey;
    result.deviceKey = rawDeviceKey;
  }

  if (target === 'API_KEY') {
    const rawApiKey = generateMerchantApiKey();
    const apiKeyHash = await hashSha256(rawApiKey);
    const apiKeyPrefix = rawApiKey.slice(0, 12);
    const publishableKey = existing[0].publishableKey || generatePublishableKey();
    updateData.apiKeyHash = apiKeyHash;
    updateData.apiKeyPrefix = apiKeyPrefix;
    updateData.publishableKey = publishableKey;
    result.apiKey = rawApiKey;
    result.apiKeyPrefix = apiKeyPrefix;
    result.publishableKey = publishableKey;
  }

  await db.update(merchants).set(updateData).where(eq(merchants.id, merchantId));

  return result;
}

/**
 * Registers a new merchant in ORBIT Hub.
 */
export async function registerMerchant(
  db: AppDb,
  input: RegisterMerchantInput,
  pepper = '',
  env?: Env
): Promise<RegisterMerchantResult> {
  if (input.webhookUrl && input.webhookUrl.trim() !== '') {
    validateSafeWebhookUrl(input.webhookUrl.trim(), env);
  }

  const merchantId = `mer_live_${generateSecureToken(12)}`;
  const webhookSecret = generateWebhookSecret();
  const rawDeviceKey = generateDeviceApiKey();
  const deviceApiKeyHash = await hashDeviceApiKey(rawDeviceKey, pepper);
  const rawApiKey = generateMerchantApiKey();
  const apiKeyHash = await hashSha256(rawApiKey);
  const apiKeyPrefix = rawApiKey.slice(0, 12);
  const publishableKey = generatePublishableKey();
  const slug = await ensureUniqueMerchantSlug(db, input.slug || input.storeName);
  const now = new Date();

  await db.insert(merchants).values({
    id: merchantId,
    storeName: input.storeName,
    slug,
    webhookUrl: input.webhookUrl,
    webhookSecret,
    deviceApiKeyHash,
    apiKeyHash,
    apiKeyPrefix,
    publishableKey,
    gracePeriodMinutes: input.gracePeriodMinutes || 60,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  });

  const profile = await getMerchantProfile(db, merchantId);

  return {
    merchant: profile,
    deviceApiKey: rawDeviceKey,
    webhookSecret,
    apiKey: rawApiKey,
    publishableKey,
  };
}

/**
 * Sends a signed `webhook.test` event to the merchant's configured webhookUrl.
 */
export async function sendMerchantTestWebhook(
  db: AppDb,
  env: Env,
  merchant: MerchantRecord
) {
  if (!merchant.webhookUrl?.trim()) {
    throw new BadRequestError('Merchant webhookUrl is not configured');
  }

  const result = await dispatchWebhook(
    db,
    merchant,
    'webhook.test',
    {
      merchantId: merchant.id,
      storeName: merchant.storeName,
      externalOrderId: `TEST_${Date.now()}`,
      message: 'ORBIT Payment Hub v2 webhook connectivity verification',
      timestamp: Date.now(),
    },
    1,
    undefined,
    undefined,
    env
  );

  return result;
}

/**
 * Lists recent webhook deliveries for the authenticated merchant.
 */
export async function listMerchantWebhooks(
  db: AppDb,
  merchantId: string,
  query: ListMerchantWebhooksQuery
) {
  const conditions = [eq(webhookDeliveries.merchantId, merchantId)];
  if (query.status !== 'ALL') {
    conditions.push(eq(webhookDeliveries.status, query.status));
  }

  const whereClause = and(...conditions);

  const [countRes, items] = await Promise.all([
    db.select({ count: sql<number>`COUNT(*)` }).from(webhookDeliveries).where(whereClause),
    db
      .select()
      .from(webhookDeliveries)
      .where(whereClause)
      .orderBy(desc(webhookDeliveries.lastAttemptAt))
      .limit(query.limit)
      .offset(query.offset),
  ]);

  return {
    items,
    total: Number(countRes[0]?.count || 0),
    limit: query.limit,
    offset: query.offset,
  };
}

/**
 * Replays an existing webhook delivery preserving its immutable payloadJson & eventId.
 */
export async function replayMerchantWebhook(
  db: AppDb,
  env: Env,
  merchant: MerchantRecord,
  deliveryId: string
) {
  const rows = await db
    .select()
    .from(webhookDeliveries)
    .where(
      and(
        eq(webhookDeliveries.id, deliveryId),
        eq(webhookDeliveries.merchantId, merchant.id)
      )
    )
    .limit(1);

  const delivery = rows[0];
  if (!delivery) {
    throw new NotFoundError(`Webhook delivery '${deliveryId}' not found`);
  }

  let innerData: Record<string, unknown> = {};
  let targetOverride: string | undefined;
  try {
    const parsed = JSON.parse(delivery.payloadJson);
    innerData = parsed.data || parsed;
    if (typeof innerData.callbackUrl === 'string' && innerData.callbackUrl) {
      targetOverride = innerData.callbackUrl;
    } else if (typeof innerData.storeCallbackUrl === 'string' && innerData.storeCallbackUrl) {
      targetOverride = innerData.storeCallbackUrl;
    }
  } catch {
    innerData = {};
  }

  return dispatchWebhook(
    db,
    merchant,
    delivery.eventType,
    innerData,
    delivery.attemptCount + 1,
    delivery.id,
    targetOverride,
    env,
    delivery.payloadJson
  );
}
