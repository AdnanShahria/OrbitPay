import { eq } from 'drizzle-orm';
import type { AppDb } from '../../db/client';
import { merchants, type MerchantRecord } from '../../db/schema';
import {
  generateSecureToken,
  generateWebhookSecret,
  generateDeviceApiKey,
  hashDeviceApiKey,
} from '../../shared/crypto';
import { NotFoundError } from '../../shared/errors';
import type {
  UpdateMerchantSettingsInput,
  RegisterMerchantInput,
} from './merchants.schema';

export interface SafeMerchantProfile {
  id: string;
  storeName: string;
  webhookUrl: string;
  webhookSecret: string;
  gracePeriodMinutes: number;
  fcmToken: string | null;
  lastSeenAt: Date | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface KeyRotationResult {
  merchantId: string;
  newWebhookSecret?: string;
  newDeviceApiKey?: string; // Revealed ONLY ONCE on generation/rotation
  webhookSecret?: string;
  deviceKey?: string;
}

export interface RegisterMerchantResult {
  merchant: SafeMerchantProfile;
  deviceApiKey: string; // Plaintext revealed once for Android QR code pairing
  webhookSecret: string;
}

/**
 * Retrieves merchant profile (sanitizes device API key hash for security).
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

  return {
    id: m.id,
    storeName: m.storeName,
    webhookUrl: m.webhookUrl,
    webhookSecret: m.webhookSecret,
    gracePeriodMinutes: m.gracePeriodMinutes,
    fcmToken: m.fcmToken,
    lastSeenAt: m.lastSeenAt,
    isActive: m.isActive,
    createdAt: m.createdAt,
    updatedAt: m.updatedAt,
  };
}

/**
 * Updates merchant configurable settings (store name, webhook URL, grace window).
 */
export async function updateMerchantSettings(
  db: AppDb,
  merchantId: string,
  settings: UpdateMerchantSettingsInput
): Promise<SafeMerchantProfile> {
  const existing = await db.select().from(merchants).where(eq(merchants.id, merchantId)).limit(1);
  if (!existing[0]) {
    throw new NotFoundError(`Merchant '${merchantId}' not found`);
  }

  const now = new Date();
  await db
    .update(merchants)
    .set({
      ...(settings.storeName !== undefined && { storeName: settings.storeName }),
      ...(settings.webhookUrl !== undefined && { webhookUrl: settings.webhookUrl }),
      ...(settings.gracePeriodMinutes !== undefined && { gracePeriodMinutes: settings.gracePeriodMinutes }),
      updatedAt: now,
    })
    .where(eq(merchants.id, merchantId));

  return getMerchantProfile(db, merchantId);
}

/**
 * Rotates merchant webhook secret and/or device companion pairing API key.
 */
export async function rotateKeys(
  db: AppDb,
  merchantId: string,
  target: 'WEBHOOK_SECRET' | 'DEVICE_API_KEY' | 'DEVICE_KEY' | 'BOTH',
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

  await db.update(merchants).set(updateData).where(eq(merchants.id, merchantId));

  return result;
}

/**
 * Registers a new merchant in ORBIT Hub.
 */
export async function registerMerchant(
  db: AppDb,
  input: RegisterMerchantInput,
  pepper = ''
): Promise<RegisterMerchantResult> {
  const merchantId = `mer_live_${generateSecureToken(12)}`;
  const webhookSecret = generateWebhookSecret();
  const rawDeviceKey = generateDeviceApiKey();
  const deviceApiKeyHash = await hashDeviceApiKey(rawDeviceKey, pepper);
  const now = new Date();

  await db.insert(merchants).values({
    id: merchantId,
    storeName: input.storeName,
    webhookUrl: input.webhookUrl,
    webhookSecret,
    deviceApiKeyHash,
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
  };
}
