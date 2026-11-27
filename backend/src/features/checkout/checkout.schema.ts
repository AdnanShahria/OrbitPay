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

export const verifyCheckoutSchema = z
  .object({
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
    trxId: z.string().trim().min(3, 'Transaction ID is too short'),
    senderNumber: z
      .string()
      .trim()
      .min(10, 'Sender phone number must be at least 10 digits'),
    customerEmail: z.string().trim().email().optional().or(z.literal('')),
    sessionToken: z.string().optional(),
    receiptAssetId: z.string().trim().optional(),
    receiptUrl: z.string().trim().optional(),
  })
  .refine((data) => (data.paidAmount ?? data.amount ?? 0) > 0, {
    message: 'Either paidAmount or amount must be greater than 0',
    path: ['paidAmount'],
  });

export const sessionStatusQuerySchema = z.object({
  merchantId: z.string().min(1, 'Merchant ID is required'),
  orderId: z.string().min(1, 'Order ID is required'),
});

export type CreateSessionInput = z.infer<typeof createSessionSchema>;
export type VerifyCheckoutInput = z.infer<typeof verifyCheckoutSchema>;
export type SessionStatusQuery = z.infer<typeof sessionStatusQuerySchema>;
