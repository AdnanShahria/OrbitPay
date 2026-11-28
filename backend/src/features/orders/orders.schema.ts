import { z } from 'zod';
import {
  ORDER_PAYMENT_METHODS,
  ORDER_PAYMENT_STATUSES,
  ORDER_STATUSES,
} from '../../db/schema';

export const ORDER_ACTIONS = [
  'CONFIRM',
  'READY_TO_SHIP',
  'SHIP',
  'MARK_PAID',
  'CANCEL',
] as const;
export type OrderAction = (typeof ORDER_ACTIONS)[number];

export const notifyOrderSchema = z.object({
  projectId: z.string().trim().min(1).max(80).optional(),
  externalOrderId: z.string().trim().min(1, 'External order ID is required'),
  customerName: z.string().trim().max(200).optional(),
  customerPhone: z.string().trim().max(40).optional(),
  customerEmail: z.string().trim().email('Valid email required').optional().or(z.literal('')),
  shippingAddress: z.string().trim().max(500).optional(),
  itemsSummary: z.string().trim().max(1000).optional(),
  paymentMethod: z.enum(ORDER_PAYMENT_METHODS).default('ORBIT_MFS'),
  paymentStatus: z.enum(ORDER_PAYMENT_STATUSES).optional(),
  orderStatus: z.enum(ORDER_STATUSES).optional(),
  baseAmount: z.number().nonnegative('Base amount must be zero or positive'),
  uniqueAmount: z.number().positive().optional(),
  paidAmount: z.number().nonnegative().optional(),
  trxId: z.string().trim().optional(),
  storeCallbackUrl: z.string().url('Valid callback URL required').optional().or(z.literal('')),
  metadata: z.record(z.unknown()).optional(),
});

export const listOrdersQuerySchema = z.object({
  projectId: z.string().trim().min(1).max(80).optional(),
  orderStatus: z.string().optional(),
  paymentMethod: z.string().optional(),
  search: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export const orderActionSchema = z.object({
  action: z.enum(ORDER_ACTIONS),
  note: z
    .string()
    .trim()
    .max(500)
    .nullish()
    .transform((v) => (v == null || v === '' ? undefined : v)),
});

export type NotifyOrderInput = z.infer<typeof notifyOrderSchema>;
export type ListOrdersQuery = z.infer<typeof listOrdersQuerySchema>;
export type OrderActionInput = z.infer<typeof orderActionSchema>;
