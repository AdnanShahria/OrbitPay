import { z } from 'zod';
import { MFS_PROVIDERS, VERIFICATION_MODES, VERTICAL_PROFILES } from '../../db/schema';
import { paymentActionSchema, paymentDisplaySchema } from '../payments/payments.schema';

const nullishToUndefined = <T extends z.ZodTypeAny>(schema: T) =>
  schema.nullish().transform((v) => (v === null ? undefined : v));

const optionalNullableString = (minLen = 0, maxLen = 1000) =>
  z
    .string()
    .trim()
    .max(maxLen)
    .nullish()
    .transform((v) => {
      if (v == null || v === '') return undefined;
      return v;
    })
    .refine((v) => v === undefined || v.length >= minLen, {
      message: `Must be at least ${minLen} characters`,
    });

const isHttpOrHttpsUrl = (value: string): boolean => {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
};

const optionalNullableUrl = z
  .union([
    z.string().trim().url().refine(isHttpOrHttpsUrl, 'URL must use http:// or https://'),
    z.literal(''),
  ])
  .nullish()
  .transform((v) => (v == null || v === '' ? undefined : v));

export const createPaymentLinkSchema = z
  .object({
    slug: z
      .string()
      .trim()
      .min(3)
      .max(80)
      .regex(/^[a-z0-9-]+$/i, 'Slug may only contain letters, numbers, and hyphens')
      .transform((s) => s.toLowerCase())
      .nullish()
      .transform((v) => (v == null ? undefined : v)),
    title: z.string().trim().min(2).max(160),
    description: optionalNullableString(0, 1000),
    vertical: z
      .enum(VERTICAL_PROFILES)
      .nullish()
      .transform((v) => v ?? 'custom'),
    amountType: z
      .enum(['FIXED', 'OPEN'])
      .nullish()
      .transform((v) => v ?? 'FIXED'),
    fixedAmount: nullishToUndefined(z.number().positive()),
    minAmount: nullishToUndefined(z.number().positive()),
    maxAmount: nullishToUndefined(z.number().positive()),
    currency: z
      .string()
      .trim()
      .min(3)
      .max(8)
      .nullish()
      .transform((v) => v ?? 'BDT'),
    verificationMode: nullishToUndefined(z.enum(VERIFICATION_MODES)),
    display: nullishToUndefined(paymentDisplaySchema),
    actions: nullishToUndefined(z.array(paymentActionSchema).max(8)),
    metadata: nullishToUndefined(z.record(z.unknown())),
    returnUrl: optionalNullableUrl,
    cancelUrl: optionalNullableUrl,
    maxUses: nullishToUndefined(z.number().int().positive()),
    expiresAt: nullishToUndefined(z.string().datetime()),
  })
  .refine((d) => (d.amountType === 'FIXED' ? (d.fixedAmount ?? 0) > 0 : true), {
    message: 'fixedAmount is required when amountType is FIXED',
    path: ['fixedAmount'],
  })
  .refine(
    (d) =>
      d.minAmount !== undefined && d.maxAmount !== undefined
        ? d.minAmount <= d.maxAmount
        : true,
    {
      message: 'minAmount cannot exceed maxAmount',
      path: ['maxAmount'],
    }
  );

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
  returnUrl: z
    .union([
      z.string().trim().url().refine(isHttpOrHttpsUrl, 'URL must use http:// or https://'),
      z.literal(''),
    ])
    .optional()
    .nullable(),
  cancelUrl: z
    .union([
      z.string().trim().url().refine(isHttpOrHttpsUrl, 'URL must use http:// or https://'),
      z.literal(''),
    ])
    .optional()
    .nullable(),
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
