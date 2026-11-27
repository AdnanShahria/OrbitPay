import { z } from 'zod';
import { RECEIPT_POLICIES, VERIFICATION_MODES } from '../../db/schema';

const optionalWebhookUrl = z
  .union([z.string().trim().url('Must be a valid HTTP/HTTPS URL'), z.literal('')])
  .optional();

export const updateMerchantSettingsSchema = z.object({
  storeName: z.string().trim().min(2, 'Store name must be at least 2 characters').optional(),
  slug: z
    .string()
    .trim()
    .min(2, 'Handle must be at least 2 characters')
    .max(48)
    .regex(/^[a-z0-9-]+$/i, 'Handle may only contain letters, numbers, and hyphens')
    .transform((v) => v.toLowerCase())
    .optional(),
  webhookUrl: optionalWebhookUrl,
  gracePeriodMinutes: z.number().int().min(5).max(1440).optional(),
  verificationMode: z.enum(VERIFICATION_MODES).optional(),
  allowBaseAmountFallback: z.boolean().optional(),
  receiptPolicy: z.enum(RECEIPT_POLICIES).optional(),
  lateSmsAutoApprove: z.boolean().optional(),
  enabledModules: z
    .object({
      ecommerce_fulfillment: z.boolean().optional(),
      phone_otp: z.boolean().optional(),
      telegram_alerts: z.boolean().optional(),
    })
    .optional(),
  allowedCallbackOrigins: z.array(z.string().trim().url()).max(20).optional(),
  telegramBotToken: z.string().trim().max(200).optional().nullable(),
  telegramChatId: z.string().trim().max(100).optional().nullable(),
});

export const rotateKeysSchema = z.object({
  target: z.enum(['WEBHOOK_SECRET', 'DEVICE_API_KEY', 'DEVICE_KEY', 'API_KEY', 'BOTH']),
});

export const registerMerchantSchema = z.object({
  storeName: z.string().trim().min(2, 'Store name is required'),
  slug: z
    .string()
    .trim()
    .min(2)
    .max(48)
    .regex(/^[a-z0-9-]+$/i)
    .transform((v) => v.toLowerCase())
    .optional(),
  webhookUrl: optionalWebhookUrl.default(''),
  gracePeriodMinutes: z.number().int().min(5).max(1440).optional().default(60),
});

export const listMerchantWebhooksQuerySchema = z.object({
  status: z.enum(['DELIVERED', 'FAILED', 'RETRYING', 'ALL']).optional().default('ALL'),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export type UpdateMerchantSettingsInput = z.infer<typeof updateMerchantSettingsSchema>;
export type RotateKeysInput = z.infer<typeof rotateKeysSchema>;
export type RegisterMerchantInput = z.infer<typeof registerMerchantSchema>;
export type ListMerchantWebhooksQuery = z.infer<typeof listMerchantWebhooksQuerySchema>;
