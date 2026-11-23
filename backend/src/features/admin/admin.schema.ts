import { z } from 'zod';
import { USER_ROLES } from '../../db/schema';

export const verifyAdminKeySchema = z.object({
  adminKey: z.string().trim().min(1, 'Admin key is required'),
});

const optionalWebhookUrl = z
  .union([
    z.string().trim().url('A valid HTTPS/HTTP webhook URL is required'),
    z.literal(''),
  ])
  .optional()
  .default('');

const optionalBlankToUndefined = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((val) => (typeof val === 'string' && val.trim() === '' ? undefined : val), schema.optional());

export const createProjectSchema = z.object({
  id: optionalBlankToUndefined(
    z.string().trim().min(3, 'Project ID must be at least 3 characters').regex(/^[a-z0-9_-]+$/i, 'Alphanumeric project ID required')
  ),
  storeName: z.string().trim().min(2, 'Store name must be at least 2 characters'),
  webhookUrl: optionalWebhookUrl,
  gracePeriodMinutes: z.number().int().min(5).max(1440).default(60),
  ownerEmail: optionalBlankToUndefined(
    z
      .string()
      .trim()
      .email('Valid owner email is required')
      .transform((v) => v.toLowerCase())
  ),
  ownerPassword: optionalBlankToUndefined(z.string().min(6, 'Owner password must be at least 6 characters')),
  ownerName: optionalBlankToUndefined(z.string().trim().min(2, 'Owner name must be at least 2 characters')),
});

export const updateProjectSchema = z.object({
  storeName: z.string().trim().min(2).optional(),
  webhookUrl: z.union([z.string().trim().url('Must be a valid HTTP/HTTPS URL'), z.literal('')]).optional(),
  gracePeriodMinutes: z.number().int().min(5).max(1440).optional(),
  isActive: z.boolean().optional(),
});

export const createProjectUserSchema = z.object({
  email: z
    .string()
    .trim()
    .email('Valid user email is required')
    .transform((v) => v.toLowerCase()),
  fullName: z.string().trim().min(2, 'Full name must be at least 2 characters').default('Merchant User'),
  password: z.string().min(6, 'Password must be at least 6 characters').optional(),
  role: z.enum(USER_ROLES).default('MERCHANT_STAFF'),
});

export const resetUserPasswordSchema = z.object({
  password: z.string().min(6, 'Password must be at least 6 characters').optional(),
});

export type CreateProjectDTO = z.infer<typeof createProjectSchema>;
export type UpdateProjectDTO = z.infer<typeof updateProjectSchema>;
export type CreateProjectUserDTO = z.infer<typeof createProjectUserSchema>;
export type ResetUserPasswordDTO = z.infer<typeof resetUserPasswordSchema>;
