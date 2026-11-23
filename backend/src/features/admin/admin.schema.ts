import { z } from 'zod';
import { USER_ROLES } from '../../db/schema';

export const verifyAdminKeySchema = z.object({
  adminKey: z.string().min(1, 'Admin key is required'),
});

export const createProjectSchema = z.object({
  id: z.string().trim().min(3).regex(/^[a-z0-9_-]+$/i, 'Alphanumeric project ID required').optional(),
  storeName: z.string().trim().min(2, 'Store name must be at least 2 characters'),
  webhookUrl: z.string().url('A valid HTTPS/HTTP webhook URL is required'),
  gracePeriodMinutes: z.number().int().min(5).max(1440).default(60),
  ownerEmail: z
    .string()
    .trim()
    .email('Valid owner email is required')
    .transform((v) => v.toLowerCase())
    .optional(),
  ownerPassword: z.string().min(6, 'Owner password must be at least 6 characters').optional(),
  ownerName: z.string().trim().min(2, 'Owner name must be at least 2 characters').optional(),
});

export const updateProjectSchema = z.object({
  storeName: z.string().trim().min(2).optional(),
  webhookUrl: z.string().url().optional(),
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
