import { z } from 'zod';

export const updateMerchantSettingsSchema = z.object({
  storeName: z.string().trim().min(2, 'Store name must be at least 2 characters').optional(),
  webhookUrl: z.string().trim().url('Must be a valid HTTP/HTTPS URL').optional(),
  gracePeriodMinutes: z.number().int().min(5).max(1440).optional(),
});

export const rotateKeysSchema = z.object({
  target: z.enum(['WEBHOOK_SECRET', 'DEVICE_API_KEY', 'BOTH']),
});

export const registerMerchantSchema = z.object({
  storeName: z.string().trim().min(2, 'Store name is required'),
  webhookUrl: z.string().trim().url('Valid webhook URL is required'),
  gracePeriodMinutes: z.number().int().min(5).max(1440).optional().default(60),
});

export type UpdateMerchantSettingsInput = z.infer<typeof updateMerchantSettingsSchema>;
export type RotateKeysInput = z.infer<typeof rotateKeysSchema>;
export type RegisterMerchantInput = z.infer<typeof registerMerchantSchema>;
