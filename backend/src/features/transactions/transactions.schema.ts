import { z } from 'zod';
import { MFS_PROVIDERS, LEDGER_STATUSES } from '../../db/schema';

export const listTransactionsQuerySchema = z.object({
  status: z.enum([...LEDGER_STATUSES, 'ALL']).optional().default('ALL'),
  provider: z.enum(MFS_PROVIDERS).optional(),
  search: z.string().trim().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

export const manualMatchSchema = z.object({
  smsLedgerId: z.string().min(1, 'SMS Ledger ID is required'),
  externalOrderId: z.string().trim().min(1, 'External Order ID is required'),
  customerEmail: z.string().email().optional(),
});

export type ListTransactionsQuery = z.infer<typeof listTransactionsQuerySchema>;
export type ManualMatchInput = z.infer<typeof manualMatchSchema>;
