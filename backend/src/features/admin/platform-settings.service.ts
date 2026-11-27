import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { ensureRuntimeSchema } from '../../db/bootstrap';
import type { AppDb } from '../../db/client';
import { platformSettings } from '../../db/schema';
import { recordAdminAudit, type AdminActor } from './admin-auth.service';

const PUBLIC_BRANDING_KEY = 'public_branding';

export interface PlatformPublicSettings {
  whatsappNumber: string;
  whatsappPrefillMessage: string;
  marketingSiteUrl: string;
  marketingHeadline: string;
  marketingCtaLabel: string;
  supportEmail: string;
  updatedAt: string;
}

export const DEFAULT_PLATFORM_SETTINGS: PlatformPublicSettings = {
  whatsappNumber: '',
  whatsappPrefillMessage:
    'Hi ORBIT SaaS, I want to set up an automated bKash/Nagad/Rocket payment system for my business.',
  marketingSiteUrl: 'https://orbitsaas.cloud',
  marketingHeadline: 'Automate bKash, Nagad & Rocket payments for your business',
  marketingCtaLabel: 'Setup Automated Payments',
  supportEmail: '',
  updatedAt: new Date(0).toISOString(),
};

export const updatePlatformSettingsSchema = z.object({
  whatsappNumber: z
    .string()
    .trim()
    .max(32, 'WhatsApp number is too long')
    .refine(
      (val) => val === '' || /^\+?[0-9\s()-]{6,24}$/.test(val),
      'Enter a valid WhatsApp number with country code (e.g. +88017XXXXXXXX)'
    )
    .optional(),
  whatsappPrefillMessage: z.string().trim().min(2).max(500).optional(),
  marketingSiteUrl: z
    .union([z.string().trim().url('Enter a valid URL (e.g. https://orbitsaas.cloud)'), z.literal('')])
    .optional(),
  marketingHeadline: z.string().trim().min(4).max(180).optional(),
  marketingCtaLabel: z.string().trim().min(2).max(60).optional(),
  supportEmail: z.union([z.string().trim().email('Enter a valid email'), z.literal('')]).optional(),
});

export type UpdatePlatformSettingsInput = z.infer<typeof updatePlatformSettingsSchema>;

function normalizeWhatsappNumber(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  const hasPlus = trimmed.startsWith('+');
  const digits = trimmed.replace(/\D/g, '');
  if (!digits) return '';
  return hasPlus ? `+${digits}` : digits;
}

export async function getPlatformSettings(db: AppDb): Promise<PlatformPublicSettings> {
  try {
    await ensureRuntimeSchema(db);
    const rows = await db
      .select()
      .from(platformSettings)
      .where(eq(platformSettings.key, PUBLIC_BRANDING_KEY))
      .limit(1);

    const row = rows[0];
    if (!row) {
      return DEFAULT_PLATFORM_SETTINGS;
    }

    const parsed = JSON.parse(row.valueJson) as Partial<PlatformPublicSettings>;
    return {
      whatsappNumber:
        typeof parsed.whatsappNumber === 'string'
          ? parsed.whatsappNumber
          : DEFAULT_PLATFORM_SETTINGS.whatsappNumber,
      whatsappPrefillMessage:
        typeof parsed.whatsappPrefillMessage === 'string' && parsed.whatsappPrefillMessage.trim()
          ? parsed.whatsappPrefillMessage
          : DEFAULT_PLATFORM_SETTINGS.whatsappPrefillMessage,
      marketingSiteUrl:
        typeof parsed.marketingSiteUrl === 'string' && parsed.marketingSiteUrl.trim()
          ? parsed.marketingSiteUrl
          : DEFAULT_PLATFORM_SETTINGS.marketingSiteUrl,
      marketingHeadline:
        typeof parsed.marketingHeadline === 'string' && parsed.marketingHeadline.trim()
          ? parsed.marketingHeadline
          : DEFAULT_PLATFORM_SETTINGS.marketingHeadline,
      marketingCtaLabel:
        typeof parsed.marketingCtaLabel === 'string' && parsed.marketingCtaLabel.trim()
          ? parsed.marketingCtaLabel
          : DEFAULT_PLATFORM_SETTINGS.marketingCtaLabel,
      supportEmail:
        typeof parsed.supportEmail === 'string'
          ? parsed.supportEmail
          : DEFAULT_PLATFORM_SETTINGS.supportEmail,
      updatedAt: row.updatedAt ? row.updatedAt.toISOString() : new Date().toISOString(),
    };
  } catch {
    return DEFAULT_PLATFORM_SETTINGS;
  }
}

export async function updatePlatformSettings(
  db: AppDb,
  input: UpdatePlatformSettingsInput,
  actor?: AdminActor
): Promise<PlatformPublicSettings> {
  await ensureRuntimeSchema(db);
  const current = await getPlatformSettings(db);
  const now = new Date();

  const next: PlatformPublicSettings = {
    whatsappNumber:
      input.whatsappNumber !== undefined
        ? normalizeWhatsappNumber(input.whatsappNumber)
        : current.whatsappNumber,
    whatsappPrefillMessage:
      input.whatsappPrefillMessage !== undefined
        ? input.whatsappPrefillMessage.trim()
        : current.whatsappPrefillMessage,
    marketingSiteUrl:
      input.marketingSiteUrl !== undefined
        ? input.marketingSiteUrl.trim() || DEFAULT_PLATFORM_SETTINGS.marketingSiteUrl
        : current.marketingSiteUrl,
    marketingHeadline:
      input.marketingHeadline !== undefined
        ? input.marketingHeadline.trim()
        : current.marketingHeadline,
    marketingCtaLabel:
      input.marketingCtaLabel !== undefined
        ? input.marketingCtaLabel.trim()
        : current.marketingCtaLabel,
    supportEmail:
      input.supportEmail !== undefined ? input.supportEmail.trim() : current.supportEmail,
    updatedAt: now.toISOString(),
  };

  await db
    .insert(platformSettings)
    .values({
      key: PUBLIC_BRANDING_KEY,
      valueJson: JSON.stringify(next),
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: platformSettings.key,
      set: {
        valueJson: JSON.stringify(next),
        updatedAt: now,
      },
    });

  await recordAdminAudit(db, {
    action: 'PLATFORM_SETTINGS_UPDATED',
    actor,
    targetType: 'platform_settings',
    targetId: PUBLIC_BRANDING_KEY,
    metadata: {
      whatsappConfigured: Boolean(next.whatsappNumber),
      marketingSiteUrl: next.marketingSiteUrl,
    },
  });

  return next;
}
