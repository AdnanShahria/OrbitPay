import { Hono } from 'hono';
import type { AppContextEnv } from '../../shared/types';
import { authMerchantMiddleware } from '../../shared/middleware';
import { UnauthorizedError } from '../../shared/errors';
import { loginSchema } from './auth.schema';
import {
  loginUser,
  getCurrentAuthContext,
  revokeSession,
  listMerchantSessions,
} from './auth.service';

const router = new Hono<AppContextEnv>();

/**
 * POST /api/v1/auth/login
 * Authenticates admin-provisioned merchant users (Web Portal & Android Companion App).
 */
router.post('/login', async (c) => {
  const db = c.get('db');
  const body = await c.req.json();
  const input = loginSchema.parse(body);
  const ipAddress =
    c.req.header('cf-connecting-ip') ||
    c.req.header('x-forwarded-for')?.split(',')[0]?.trim();

  const result = await loginUser(db, c.env, input, ipAddress);
  return c.json({ success: true, data: result });
});

/**
 * GET /api/v1/auth/me
 * Returns current authenticated user, session, and safe merchant profile (Bearer JWT required).
 */
router.get('/me', authMerchantMiddleware, async (c) => {
  const userId = c.get('userId');
  const sessionId = c.get('sessionId');
  const merchantId = c.get('merchantId');

  if (!userId || !sessionId || !merchantId) {
    throw new UnauthorizedError('Bearer JWT session token is required');
  }

  const db = c.get('db');
  const data = await getCurrentAuthContext(db, userId, sessionId, merchantId);
  return c.json({ success: true, data });
});

/**
 * POST /api/v1/auth/logout
 * Revokes the current JWT session immediately.
 */
router.post('/logout', authMerchantMiddleware, async (c) => {
  const sessionId = c.get('sessionId');
  if (!sessionId) {
    throw new UnauthorizedError('Bearer JWT session token is required');
  }

  const db = c.get('db');
  await revokeSession(db, sessionId);
  return c.json({ success: true, message: 'Session revoked successfully' });
});

/**
 * GET /api/v1/auth/sessions
 * Lists recent sessions for the authenticated merchant.
 */
router.get('/sessions', authMerchantMiddleware, async (c) => {
  const db = c.get('db');
  const merchantId = c.get('merchantId')!;
  const sessions = await listMerchantSessions(db, merchantId);
  return c.json({ success: true, data: sessions });
});

export default router;
