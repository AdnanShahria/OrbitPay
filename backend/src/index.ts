import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { AppContextEnv } from './shared/types';
import { authMasterAdminMiddleware, dbMiddleware, errorHandler } from './shared/middleware';
import checkoutRoutes from './features/checkout/checkout.routes';
import deviceRoutes from './features/device/device.routes';
import walletsRoutes from './features/wallets/wallets.routes';
import transactionsRoutes from './features/transactions/transactions.routes';
import merchantsRoutes from './features/merchants/merchants.routes';
import realtimeRoutes from './features/realtime/realtime.routes';
import adminMessagingRoutes from './features/admin/messaging.routes';
import adminRoutes from './features/admin/admin.routes';
import { appPublicRoutes, adminReleasesRoutes } from './features/releases/releases.routes';
import authRoutes from './features/auth/auth.routes';
import ordersRoutes from './features/orders/orders.routes';
import otpRoutes from './features/otp/otp.routes';
import { paymentIntentsRoutes, paymentsRoutes } from './features/payments/payments.routes';
import paymentLinksRoutes from './features/payment-links/payment-links.routes';
import { getPlatformSettings } from './features/admin/platform-settings.service';
import { routerRoutes } from './router';
import { processWebhookRetries } from './features/webhooks/webhook.dispatcher';

const app = new Hono<AppContextEnv>();

// 1. Cross-Origin Resource Sharing (CORS) Configuration
// Skips header mutation on WebSocket upgrades so immutable 101 Responses from Durable Objects pass through untouched.
const corsMiddleware = cors({
  origin: (origin) => origin || '*',
  allowHeaders: [
    'Content-Type',
    'Authorization',
    'X-Merchant-Api-Key',
    'X-Merchant-Secret',
    'X-Merchant-Id',
    'X-Device-Key',
    'X-Admin-Key',
    'X-Session-Token',
    'X-Setup-Unlock-Token',
    'X-Orbit-Signature',
    'X-Orbit-Signature-V2',
  ],
  allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  exposeHeaders: ['Content-Length', 'X-Orbit-Signature', 'X-Orbit-Signature-V2'],
  maxAge: 86400,
  credentials: true,
});

app.use('*', async (c, next) => {
  if (c.req.header('upgrade')?.toLowerCase() === 'websocket') {
    await next();
    return;
  }
  return corsMiddleware(c, next);
});

// 2. Attach Drizzle D1 Database Client & prevent HTTP/edge caching on auth/admin APIs
app.use('*', dbMiddleware);
app.use('/api/v1/admin/*', async (c, next) => {
  await next();
  c.header('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  c.header('Pragma', 'no-cache');
  c.header('Expires', '0');
});
app.use('/api/v1/auth/*', async (c, next) => {
  await next();
  c.header('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  c.header('Pragma', 'no-cache');
  c.header('Expires', '0');
});

// 3. Global Error Handling
app.onError(errorHandler);

// 4. Root Health Check Endpoints
app.get('/health', (c) => {
  return c.json({
    status: 'healthy',
    service: 'ORBIT Payment Hub Edge Backend',
    version: '2.0.0-PROD',
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

app.get('/api/v1/public/platform-config', async (c) => {
  const db = c.get('db');
  const data = await getPlatformSettings(db);
  c.header('Cache-Control', 'no-store, no-cache, must-revalidate');
  return c.json({ success: true, data });
});

// 5. Mount Feature Sub-routers under /api/v1
app.route('/api/v1/auth', authRoutes);
app.route('/api/v1/orders', ordersRoutes);
app.route('/api/v1/payment-intents', paymentIntentsRoutes);
app.route('/api/v1/payments', paymentsRoutes);
app.route('/api/v1/payment-links', paymentLinksRoutes);
app.route('/api/v1/checkout', checkoutRoutes);
app.route('/api/v1/device', deviceRoutes);
app.route('/api/v1/wallets', walletsRoutes);
app.route('/api/v1/transactions', transactionsRoutes);
app.route('/api/v1/merchants', merchantsRoutes);
app.route('/api/v1/realtime', realtimeRoutes);
app.route('/api/v1/otp', otpRoutes);
app.route('/api/v1/app', appPublicRoutes);
app.route('/api/v1/admin/releases', adminReleasesRoutes);
app.route('/api/v1/admin/messaging', adminMessagingRoutes);
app.route('/api/v1/admin', adminRoutes);
app.route('/api/v1/router', routerRoutes);

// 6. Webhook Retries Engine Trigger (Protected by Master Admin Key)
app.post('/api/v1/webhooks/retry', authMasterAdminMiddleware, async (c) => {
  const db = c.get('db');
  const result = await processWebhookRetries(db, c.env);
  return c.json({ success: true, data: result });
});

export default app;
export type AppType = typeof app;
