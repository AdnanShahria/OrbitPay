import { z } from 'zod';
import {
  ACCOUNT_MODES,
  VERIFICATION_MODES,
  WALLET_SELECTION_MODES,
} from '../../db/schema';

const isHttpOrHttpsUrl = (value: string): boolean => {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
};

const optionalSlug = z.preprocess(
  (val) => (typeof val === 'string' && val.trim() === '' ? undefined : val),
  z
    .string()
    .trim()
    .min(2, 'Slug must be at least 2 characters')
    .max(48)
    .regex(/^[a-z0-9-]+$/i, 'Slug may only contain letters, numbers, and hyphens')
    .transform((s) => s.toLowerCase())
    .optional()
);

const optionalWebhookUrl = z
  .union([
    z.string().trim().url('Must be a valid HTTP/HTTPS URL').refine(isHttpOrHttpsUrl, 'URL must use http:// or https://'),
    z.literal(''),
  ])
  .optional();

export const createSubProjectSchema = z.object({
  name: z.string().trim().min(2, 'Project name must be at least 2 characters').max(120),
  slug: optionalSlug,
  description: z.string().trim().max(500).optional().nullable(),
  accountMode: z.enum(ACCOUNT_MODES).optional().default('WEBHOOK_CONNECTED'),
  verificationMode: z.enum(VERIFICATION_MODES).optional().default('AUTO'),
  walletSelectionMode: z.enum(WALLET_SELECTION_MODES).optional().default('COMMON'),
  walletIds: z.array(z.string().trim().min(1)).max(50).optional().default([]),
  ignoreStorefrontSync: z.boolean().optional(),
  webhookUrl: optionalWebhookUrl.default(''),
  allowedCallbackOrigins: z.array(z.string().trim().min(1).max(200)).max(20).optional(),
  telegramBotToken: z.string().trim().max(200).optional().nullable(),
  telegramChatId: z.string().trim().max(64).optional().nullable(),
  isDefault: z.boolean().optional().default(false),
});

export const adminUpdateSubProjectSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  slug: optionalSlug,
  description: z.string().trim().max(500).optional().nullable(),
  accountMode: z.enum(ACCOUNT_MODES).optional(),
  verificationMode: z.enum(VERIFICATION_MODES).optional(),
  walletSelectionMode: z.enum(WALLET_SELECTION_MODES).optional(),
  walletIds: z.array(z.string().trim().min(1)).max(50).optional(),
  ignoreStorefrontSync: z.boolean().optional(),
  webhookUrl: optionalWebhookUrl,
  allowedCallbackOrigins: z.array(z.string().trim().min(1).max(200)).max(20).optional(),
  telegramBotToken: z.string().trim().max(200).optional().nullable(),
  telegramChatId: z.string().trim().max(64).optional().nullable(),
  isDefault: z.boolean().optional(),
  isActive: z.boolean().optional(),
});

export const merchantUpdateSubProjectSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  description: z.string().trim().max(500).optional().nullable(),
  accountMode: z.enum(ACCOUNT_MODES).optional(),
  verificationMode: z.enum(VERIFICATION_MODES).optional(),
  walletSelectionMode: z.enum(WALLET_SELECTION_MODES).optional(),
  walletIds: z.array(z.string().trim().min(1)).max(50).optional(),
  ignoreStorefrontSync: z.boolean().optional(),
  webhookUrl: optionalWebhookUrl,
  allowedCallbackOrigins: z.array(z.string().trim().min(1).max(200)).max(20).optional(),
  telegramBotToken: z.string().trim().max(200).optional().nullable(),
  telegramChatId: z.string().trim().max(64).optional().nullable(),
});

export const rotateProjectKeysSchema = z.object({
  target: z.enum(['webhook', 'api', 'all']).default('all'),
});

export type CreateSubProjectInput = z.infer<typeof createSubProjectSchema>;
export type AdminUpdateSubProjectInput = z.infer<typeof adminUpdateSubProjectSchema>;
export type MerchantUpdateSubProjectInput = z.infer<typeof merchantUpdateSubProjectSchema>;
export type RotateProjectKeysInput = z.infer<typeof rotateProjectKeysSchema>;
