import { z } from 'zod';
import {
  MFS_PROVIDERS,
  PAYMENT_INTENT_STATUSES,
  RESOLUTION_SOURCES,
  VERIFICATION_MODES,
  VERTICAL_PROFILES,
} from '../../db/schema';

export const displayHighlightSchema = z.object({
  label: z.string().trim().min(1).max(80),
  value: z.string().trim().min(1).max(200),
});

export const paymentDisplaySchema = z.object({
  appName: z.string().trim().min(1).max(100).optional(),
  appDomain: z.string().trim().max(150).optional(),
  category: z.string().trim().max(80).optional(),
  referenceLabel: z.string().trim().max(60).optional(),
  title: z.string().trim().min(1).max(200).optional(),
  subtitle: z.string().trim().max(300).optional(),
  highlights: z.array(displayHighlightSchema).max(10).optional(),
  adminDeepLink: z.string().trim().max(500).optional(),
});

export const paymentActionSchema = z.object({
  id: z.string().trim().min(1).max(64).regex(/^[a-zA-Z0-9_.-]+$/),
  label: z.string().trim().min(1).max(80),
  style: z.enum(['primary', 'secondary', 'danger']).optional().default('secondary'),
  webhookEvent: z.string().trim().max(100).optional(),
});

const isHttpOrHttpsUrl = (value: string): boolean => {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
};

export const createPaymentIntentSchema = z.object({
  externalRefId: z.string().trim().min(1, 'externalRefId is required').max(128),
  vertical: z.enum(VERTICAL_PROFILES).optional().default('ecommerce'),
  amount: z.number().positive('Payment amount must be greater than 0'),
  currency: z.string().trim().min(3).max(8).optional().default('BDT'),
  provider: z.enum(MFS_PROVIDERS).optional(),
  verificationMode: z.enum(VERIFICATION_MODES).optional(),
  callbackUrl: z
    .union([
      z.string().trim().url().refine(isHttpOrHttpsUrl, 'URL must use http:// or https://'),
      z.literal(''),
    ])
    .optional(),
  returnUrl: z
    .union([
      z.string().trim().url().refine(isHttpOrHttpsUrl, 'URL must use http:// or https://'),
      z.literal(''),
    ])
    .optional(),
  cancelUrl: z
    .union([
      z.string().trim().url().refine(isHttpOrHttpsUrl, 'URL must use http:// or https://'),
      z.literal(''),
    ])
    .optional(),
  expiresInMinutes: z.number().int().min(5).max(120).optional().default(15),
  customer: z
    .object({
      name: z.string().trim().max(150).optional(),
      email: z.union([z.string().trim().email(), z.literal('')]).optional(),
      phone: z.string().trim().max(30).optional(),
    })
    .optional(),
  display: paymentDisplaySchema.optional(),
  actions: z.array(paymentActionSchema).max(8).optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const listPaymentIntentsQuerySchema = z.object({
  status: z.enum([...PAYMENT_INTENT_STATUSES, 'ALL']).optional().default('ALL'),
  vertical: z.enum(VERTICAL_PROFILES).optional(),
  search: z.string().trim().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

const optionalNullableTrimmed = (max: number, min = 0) =>
  z
    .string()
    .trim()
    .min(min)
    .max(max)
    .nullish()
    .transform((v) => (v == null || v === '' ? undefined : v));

export const resolvePaymentSchema = z.object({
  decision: z.enum(['APPROVE', 'REJECT']),
  expectedStateVersion: z
    .number()
    .int()
    .positive()
    .nullish()
    .transform((v) => (v == null ? undefined : v)),
  resolutionSource: z
    .enum(RESOLUTION_SOURCES)
    .nullish()
    .transform((v) => (v == null ? undefined : v)),
  resolvedBy: z
    .object({
      id: z.string().optional(),
      email: z.string().optional(),
      name: z.string().optional(),
      role: z.string().optional(),
    })
    .nullish()
    .transform((v) => (v == null ? undefined : v)),
  reason: optionalNullableTrimmed(500),
  suppressWebhookEcho: z
    .boolean()
    .nullish()
    .transform((v) => Boolean(v)),
  trxId: optionalNullableTrimmed(40, 3),
});

export const checkoutResolveAliasSchema = resolvePaymentSchema.extend({
  paymentIntentId: z.string().trim().nullish().transform((v) => v ?? undefined),
  externalOrderId: z.string().trim().nullish().transform((v) => v ?? undefined),
});

export const paymentActionTriggerSchema = z.object({
  actionId: z.string().trim().min(1).max(64),
  note: optionalNullableTrimmed(500),
  payload: z
    .record(z.unknown())
    .nullish()
    .transform((v) => (v == null ? undefined : v)),
});

export const backfillPaymentIntentSchema = z.object({
  externalRefId: z.string().trim().min(1).max(128),
  vertical: z.enum(VERTICAL_PROFILES).optional().default('ecommerce'),
  baseAmount: z.number().positive(),
  uniqueAmount: z.number().positive().optional(),
  paidAmount: z.number().positive().optional(),
  provider: z.enum(MFS_PROVIDERS).optional(),
  trxId: z.string().trim().min(3).max(40).optional(),
  senderNumber: z.string().trim().max(30).optional(),
  status: z
    .enum(['OPEN', 'WAITING_FOR_SMS', 'MANUAL_REVIEW_REQUIRED', 'VERIFIED', 'REJECTED'])
    .optional()
    .default('MANUAL_REVIEW_REQUIRED'),
  verificationMode: z.enum(VERIFICATION_MODES).optional(),
  callbackUrl: z.union([z.string().trim().url(), z.literal('')]).optional(),
  customer: z
    .object({
      name: z.string().trim().max(150).optional(),
      email: z.union([z.string().trim().email(), z.literal('')]).optional(),
      phone: z.string().trim().max(30).optional(),
    })
    .optional(),
  display: paymentDisplaySchema.optional(),
  actions: z.array(paymentActionSchema).max(8).optional(),
  metadata: z.record(z.unknown()).optional(),
  createdAt: z.number().optional(),
});

export type CreatePaymentIntentInput = z.infer<typeof createPaymentIntentSchema>;
export type ListPaymentIntentsQuery = z.infer<typeof listPaymentIntentsQuerySchema>;
export type ResolvePaymentInput = z.infer<typeof resolvePaymentSchema>;
export type PaymentActionTriggerInput = z.infer<typeof paymentActionTriggerSchema>;
export type BackfillPaymentIntentInput = z.infer<typeof backfillPaymentIntentSchema>;
