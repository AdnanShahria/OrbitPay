import { z } from 'zod';
import { MFS_PROVIDERS, VERIFICATION_MODES, VERTICAL_PROFILES } from '../../db/schema';
import { paymentActionSchema, paymentDisplaySchema } from '../payments/payments.schema';

export const createPaymentLinkSchema = z
  .object({
    slug: z
      .string()
      .trim()
      .min(3)
      .max(80)
      .regex(/^[a-z0-9-]+$/i, 'Slug may only contain letters, numbers, and hyphens')
      .transform((s) => s.toLowerCase())
      .optional(),
    title: z.string().trim().min(2).max(160),
    description: z.string().trim().max(1000).optional(),
    vertical: z.enum(VERTICAL_PROFILES).optional().default('custom'),
    amountType: z.enum(['FIXED', 'OPEN']).default('FIXED'),
    fixedAmount: z.number().positive().optional(),
    minAmount: z.number().positive().optional(),
    maxAmount: z.number().positive().optional(),
    currency: z.string().trim().min(3).max(8).default('BDT'),
    verificationMode: z.enum(VERIFICATION_MODES).optional(),
    display: paymentDisplaySchema.optional(),
    actions: z.array(paymentActionSchema).max(8).optional(),
    metadata: z.record(z.unknown()).optional(),
    returnUrl: z.union([z.string().trim().url(), z.literal('')]).optional(),
    cancelUrl: z.union([z.string().trim().url(), z.literal('')]).optional(),
    maxUses: z.number().int().positive().optional(),
    expiresAt: z.string().datetime().optional(),
  })
  .refine((d) => (d.amountType === 'FIXED' ? (d.fixedAmount ?? 0) > 0 : true), {
    message: 'fixedAmount is required when amountType is FIXED',
    path: ['fixedAmount'],
  });

export const updatePaymentLinkSchema = z.object({
  slug: z
    .string()
    .trim()
    .min(3)
    .max(80)
    .regex(/^[a-z0-9-]+$/i, 'Slug may only contain letters, numbers, and hyphens')
    .transform((s) => s.toLowerCase())
    .optional(),
  title: z.string().trim().min(2).max(160).optional(),
  description: z.string().trim().max(1000).optional().nullable(),
  vertical: z.enum(VERTICAL_PROFILES).optional(),
  amountType: z.enum(['FIXED', 'OPEN']).optional(),
  fixedAmount: z.number().positive().optional().nullable(),
  minAmount: z.number().positive().optional().nullable(),
  maxAmount: z.number().positive().optional().nullable(),
  verificationMode: z.enum(VERIFICATION_MODES).optional().nullable(),
  display: paymentDisplaySchema.optional(),
  actions: z.array(paymentActionSchema).max(8).optional(),
  metadata: z.record(z.unknown()).optional(),
  returnUrl: z.union([z.string().trim().url(), z.literal('')]).optional().nullable(),
  cancelUrl: z.union([z.string().trim().url(), z.literal('')]).optional().nullable(),
  isActive: z.boolean().optional(),
  maxUses: z.number().int().positive().optional().nullable(),
  expiresAt: z.string().datetime().optional().nullable(),
});

export const payPaymentLinkSchema = z.object({
  amount: z.number().positive().optional(),
  provider: z.enum(MFS_PROVIDERS).optional(),
  customerName: z.string().trim().min(2, 'Please enter your name').max(150),
  customerEmail: z.union([z.string().trim().email(), z.literal('')]).optional(),
  customerPhone: z.string().trim().max(30).optional(),
  referenceNote: z.string().trim().max(200).optional(),
});

export type CreatePaymentLinkInput = z.infer<typeof createPaymentLinkSchema>;
export type UpdatePaymentLinkInput = z.infer<typeof updatePaymentLinkSchema>;
export type PayPaymentLinkInput = z.infer<typeof payPaymentLinkSchema>;
