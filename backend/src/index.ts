import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { AppContextEnv } from './shared/types';
import { dbMiddleware, errorHandler } from './shared/middleware';
import checkoutRoutes from './features/checkout/checkout.routes';
import deviceRoutes from './features/device/device.routes';
import walletsRoutes from './features/wallets/wallets.routes';
import transactionsRoutes from './features/transactions/transactions.routes';
import merchantsRoutes from './features/merchants/merchants.routes';
import realtimeRoutes from './features/realtime/realtime.routes';
import adminRoutes from './features/admin/admin.routes';
import authRoutes from './features/auth/auth.routes';
import ordersRoutes from './features/orders/orders.routes';
import { routerRoutes } from './router';
import { processWebhookRetries } from './features/webhooks/webhook.dispatcher';

const app = new Hono<AppContextEnv>();

// 1. Cross-Origin Resource Sharing (CORS) Configuration
// Allows client storefronts, payment widgets, and companion apps to communicate seamlessly
app.use(
  '*',
  cors({
    origin: (origin) => origin || '*',
    allowHeaders: [
      'Content-Type',
      'Authorization',
      'X-Merchant-Secret',
      'X-Merchant-Id',
      'X-Device-Key',
      'X-Admin-Key',
      'X-Orbit-Signature',
    ],
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    exposeHeaders: ['Content-Length', 'X-Orbit-Signature'],
    maxAge: 86400,
    credentials: true,
  })
);

// 2. Attach Drizzle D1 Database Client
app.use('*', dbMiddleware);

// 3. Global Error Handling
app.onError(errorHandler);

// 4. Root Health Check Endpoints
app.get('/health', (c) => {
  return c.json({
    status: 'healthy',
    service: 'ORBIT Payment Hub Edge Backend',
    version: '1.0.0-PROD',
    timestamp: new Date().toISOString(),
    environment: c.env.ENVIRONMENT || 'production',
  });
});

app.get('/api/v1/health', (c) => {
  return c.json({
    status: 'ok',
    edge: true,
    runtime: 'Cloudflare Pages Functions / V8',
    timestamp: Date.now(),
  });
});

// 5. Mount Feature Sub-routers under /api/v1
app.route('/api/v1/auth', authRoutes);
app.route('/api/v1/orders', ordersRoutes);
app.route('/api/v1/checkout', checkoutRoutes);
app.route('/api/v1/device', deviceRoutes);
app.route('/api/v1/wallets', walletsRoutes);
app.route('/api/v1/transactions', transactionsRoutes);
app.route('/api/v1/merchants', merchantsRoutes);
app.route('/api/v1/realtime', realtimeRoutes);
app.route('/api/v1/admin', adminRoutes);
app.route('/api/v1/router', routerRoutes);

// 6. Webhook Retries Engine Trigger (Callable by Cron or Admin)
app.post('/api/v1/webhooks/retry', async (c) => {
  const db = c.get('db');
  const result = await processWebhookRetries(db);
  return c.json({ success: true, data: result });
});

export default app;
export type AppType = typeof app;
