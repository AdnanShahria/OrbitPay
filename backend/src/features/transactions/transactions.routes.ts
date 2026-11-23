import { Hono } from 'hono';
import type { AppContextEnv } from '../../shared/types';
import { authMerchantMiddleware } from '../../shared/middleware';
import { listTransactionsQuerySchema, manualMatchSchema } from './transactions.schema';
import { listTransactions, manualMatchTransaction, listPendingQueue } from './transactions.service';

const router = new Hono<AppContextEnv>();

// Protect all transactions endpoints with merchant authentication
router.use('*', authMerchantMiddleware);

/**
 * GET /api/v1/transactions
 * Filterable, searchable, and paginated ledger listing.
 */
router.get('/', async (c) => {
  const db = c.get('db');
  const merchantId = c.get('merchantId')!;
  const queryParams = c.req.query();
  const query = listTransactionsQuerySchema.parse(queryParams);

  const result = await listTransactions(db, merchantId, query);
  return c.json({ success: true, data: result });
});

/**
 * GET /api/v1/transactions/queue
 * Returns active WAITING_FOR_SMS entries for typo rescue candidate matching.
 */
router.get('/queue', async (c) => {
  const db = c.get('db');
  const merchantId = c.get('merchantId')!;
  const queue = await listPendingQueue(db, merchantId);
  return c.json({ success: true, data: { queue } });
});

/**
 * POST /api/v1/transactions/manual-match
 * 1-Click reconciliation modal endpoint to resolve typos by linking an UNCLAIMED SMS to an order.
 */
router.post('/manual-match', async (c) => {
  const db = c.get('db');
  const merchant = c.get('merchant')!;
  const body = await c.req.json();
  const input = manualMatchSchema.parse(body);

  const matched = await manualMatchTransaction(db, merchant, input, c.env);
  return c.json({ success: true, data: matched });
});

export default router;
