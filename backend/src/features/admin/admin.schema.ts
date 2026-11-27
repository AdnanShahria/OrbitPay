import { z } from 'zod';
import { ADMIN_ROLES, USER_ROLES } from '../../db/schema';

const optionalWebhookUrl = z
  .union([
    z.string().trim().url('A valid HTTPS/HTTP webhook URL is required'),
    z.literal(''),
  ])
  .optional()
  .default('');

const optionalBlankToUndefined = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((val) => (typeof val === 'string' && val.trim() === '' ? undefined : val), schema.optional());

export const verifyAdminKeySchema = z.object({
  adminKey: z.string().trim().min(1, 'Admin key is required'),
});

export const adminLoginSchema = z
  .object({
    email: optionalBlankToUndefined(
      z
        .string()
        .trim()
        .email('Valid email is required')
        .transform((v) => v.toLowerCase())
    ),
    password: optionalBlankToUndefined(z.string().min(1, 'Password is required')),
    adminKey: optionalBlankToUndefined(z.string().trim().min(1, 'Admin key is required')),
  })
  .refine((data) => Boolean(data.adminKey) || Boolean(data.email && data.password), {
    message: 'Provide either an adminKey or both email and password',
  });

export const bootstrapAdminSchema = z.object({
  email: z
    .string()
    .trim()
    .email('Valid email is required')
    .transform((v) => v.toLowerCase()),
  fullName: z.string().trim().min(2, 'Full name must be at least 2 characters'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

export const createAdminUserSchema = z.object({
  email: z
    .string()
    .trim()
    .email('Valid email is required')
    .transform((v) => v.toLowerCase()),
  fullName: z.string().trim().min(2, 'Full name must be at least 2 characters'),
  password: optionalBlankToUndefined(z.string().min(8, 'Password must be at least 8 characters')),
  role: z.enum(ADMIN_ROLES).default('ADMIN_OPERATOR'),
});

export const updateAdminUserSchema = z.object({
  fullName: z.string().trim().min(2, 'Full name must be at least 2 characters').optional(),
  role: z.enum(ADMIN_ROLES).optional(),
  isActive: z.boolean().optional(),
  resetPassword: z
    .union([
      z.boolean(),
      z.string().min(8, 'Password must be at least 8 characters'),
    ])
    .optional(),
});

export const logoutAllAdminSchema = z.object({
  includeCurrent: z.boolean().optional().default(false),
});

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
export type AdminLoginDTO = z.infer<typeof adminLoginSchema>;
export type BootstrapAdminDTO = z.infer<typeof bootstrapAdminSchema>;
export type CreateAdminUserDTO = z.infer<typeof createAdminUserSchema>;
export type UpdateAdminUserDTO = z.infer<typeof updateAdminUserSchema>;
export type LogoutAllAdminDTO = z.infer<typeof logoutAllAdminSchema>;
