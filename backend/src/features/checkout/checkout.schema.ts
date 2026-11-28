import { z } from 'zod';
import { MFS_PROVIDERS } from '../../db/schema';

export const createSessionSchema = z.object({
  merchantId: z.string().min(1, 'Merchant ID is required'),
  orderId: z.string().min(1, 'Order ID is required'),
  amount: z.number().positive('Payment amount must be greater than 0'),
  customerEmail: z
    .string()
    .trim()
    .email('Valid customer email is required')
    .optional()
    .or(z.literal('')),
  provider: z.enum(MFS_PROVIDERS).optional(),
});

export const verifyCheckoutSchema = z.object({
  merchantId: z.string().min(1, 'Merchant ID is required'),
  orderId: z.string().min(1, 'Order ID is required'),
  sessionId: z.string().trim().optional(),
  paymentIntentId: z.string().trim().optional(),
  provider: z.enum(MFS_PROVIDERS, {
    errorMap: () => ({ message: 'Invalid MFS provider' }),
  }),
  amount: z.number().positive('Amount must be greater than 0').optional(),
  paidAmount: z.number().positive('Paid amount must be greater than 0').optional(),
  baseAmount: z.number().positive('Base amount must be greater than 0').optional(),
  trxId: z.string().trim().min(5, 'Transaction ID is too short'),
  senderNumber: z
    .string()
    .trim()
    .min(10, 'Mobile number must be 11 digits (e.g. 017XXXXXXXX)'),
  customerEmail: z.string().trim().email().optional().or(z.literal('')),
  sessionToken: z.string().optional(),
  receiptAssetId: z.string().trim().optional(),
  receiptUrl: z
    .string()
    .trim()
    .refine(
      (val) => {
        if (!val) return true;
        if (val.startsWith('/api/v1/router/image/')) return true;
        try {
          const parsed = new URL(val);
          return parsed.protocol === 'https:' || parsed.protocol === 'http:';
        } catch {
          return false;
        }
      },
      { message: 'Invalid receipt URL protocol' }
    )
    .optional(),
});

export const sessionStatusQuerySchema = z.object({
  merchantId: z.string().min(1, 'Merchant ID is required'),
  orderId: z.string().min(1, 'Order ID is required'),
});

export type CreateSessionInput = z.infer<typeof createSessionSchema>;
export type VerifyCheckoutInput = z.infer<typeof verifyCheckoutSchema>;
export type SessionStatusQuery = z.infer<typeof sessionStatusQuerySchema>;
