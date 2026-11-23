import type { MiddlewareHandler, ErrorHandler, Context } from 'hono';
import { ZodError } from 'zod';
import { eq, and, isNull, gt } from 'drizzle-orm';
import { getDb, type AppDb } from '../db/client';
import { merchants, merchantUsers, authSessions, merchantDevices } from '../db/schema';
import { hashDeviceApiKey, verifyJwt } from './crypto';
import { AppError, UnauthorizedError, ValidationError } from './errors';
import type { AppContextEnv, Env } from './types';

export interface OrbitJwtClaims extends Record<string, unknown> {
  sub: string;
  merchantId: string;
  email: string;
  role: string;
  sid: string;
  deviceType: 'WEB' | 'ANDROID';
  iat: number;
  exp: number;
}

/**
 * Resolves the HMAC secret used to sign & verify Orbit JWTs.
 */
export function resolveJwtSecret(env: Env): string {
  return env.JWT_SECRET || env.ENCRYPTION_PEPPER || env.MASTER_ADMIN_KEY || 'orbit_dev_jwt_secret_2026';
}

/**
 * Verifies a 3-segment Bearer JWT, ensures the auth_sessions row is active and unrevoked,
 * and loads the active merchant + user context onto Hono variables.
 */
async function authenticateJwtSession(
  c: Context<AppContextEnv>,
  db: AppDb,
  token: string,
  merchantIdHeader?: string
): Promise<void> {
  const claims = await verifyJwt<OrbitJwtClaims>(token, resolveJwtSecret(c.env));
  if (!claims || !claims.sub || !claims.merchantId || !claims.sid) {
    throw new UnauthorizedError('Invalid or expired JWT token');
  }

  if (merchantIdHeader && merchantIdHeader !== claims.merchantId) {
    throw new UnauthorizedError('Token merchant mismatch');
  }

  const now = new Date();
  const sessionRes = await db
    .select()
    .from(authSessions)
    .where(
      and(
        eq(authSessions.id, claims.sid),
        eq(authSessions.userId, claims.sub),
        eq(authSessions.merchantId, claims.merchantId),
        isNull(authSessions.revokedAt),
        gt(authSessions.expiresAt, now)
      )
    )
    .limit(1);

  if (!sessionRes[0]) {
    throw new UnauthorizedError('Session revoked or expired');
  }

  const userRes = await db
    .select()
    .from(merchantUsers)
    .where(and(eq(merchantUsers.id, claims.sub), eq(merchantUsers.isActive, true)))
    .limit(1);

  if (!userRes[0]) {
    throw new UnauthorizedError('User account is inactive');
  }

  const merchantRes = await db
    .select()
    .from(merchants)
    .where(and(eq(merchants.id, claims.merchantId), eq(merchants.isActive, true)))
    .limit(1);

  const merchant = merchantRes[0];
  if (!merchant) {
    throw new UnauthorizedError('Merchant not found or inactive');
  }

  c.set('merchant', merchant);
  c.set('merchantId', merchant.id);
  c.set('userId', userRes[0].id);
  c.set('sessionId', sessionRes[0].id);
  c.set('userRole', userRes[0].role);
}

/**
 * Extracts raw Bearer token from Authorization header if present.
 */
function extractBearerToken(authHeader?: string): string | undefined {
  if (authHeader && authHeader.toLowerCase().startsWith('bearer ')) {
    return authHeader.substring(7).trim();
  }
  return undefined;
}

/**
 * Middleware to attach Drizzle ORM client to request context.
 */
export const dbMiddleware: MiddlewareHandler<AppContextEnv> = async (c, next) => {
  if (!c.env?.DB) {
    throw new AppError('Cloudflare D1 Database binding (env.DB) is missing', 500, 'D1_NOT_BOUND');
  }
  const db = getDb(c.env.DB);
  c.set('db', db);
  await next();
};

/**
 * Merchant Authentication Middleware
 * Accepts EITHER:
 * - X-Merchant-Secret header (or Authorization: Bearer <webhookSecret>)
 * - Authorization: Bearer <jwt> (3 dot-separated segments, checked against auth_sessions)
 */
export const authMerchantMiddleware: MiddlewareHandler<AppContextEnv> = async (c, next) => {
  const db = c.get('db') || getDb(c.env.DB);
  const secretHeader = c.req.header('x-merchant-secret');
  const bearerToken = extractBearerToken(c.req.header('authorization'));
  const merchantIdHeader = c.req.header('x-merchant-id');

  // Prefer Bearer JWT when no X-Merchant-Secret is given and Bearer has 3 JWT segments
  if (!secretHeader && bearerToken && bearerToken.split('.').length === 3) {
    await authenticateJwtSession(c, db, bearerToken, merchantIdHeader);
    await next();
    return;
  }

  const secret = secretHeader || bearerToken;
  if (!secret) {
    throw new UnauthorizedError('Missing merchant credentials (X-Merchant-Secret or Authorization: Bearer)');
  }

  // Fallback to webhookSecret check
  const conditions = merchantIdHeader
    ? and(eq(merchants.id, merchantIdHeader), eq(merchants.webhookSecret, secret), eq(merchants.isActive, true))
    : and(eq(merchants.webhookSecret, secret), eq(merchants.isActive, true));

  const results = await db.select().from(merchants).where(conditions).limit(1);
  const merchant = results[0];

  if (!merchant) {
    throw new UnauthorizedError('Invalid merchant credentials or merchant is inactive');
  }

  c.set('merchant', merchant);
  c.set('merchantId', merchant.id);
  await next();
};

/**
 * Android Device Companion Authentication Middleware
 * Accepts EITHER:
 * - X-Device-Key (checked against merchant_devices.device_key_hash first, falling back to merchants.device_api_key_hash)
 * - Authorization: Bearer <jwt> (3 segments, checked against auth_sessions)
 */
export const authDeviceMiddleware: MiddlewareHandler<AppContextEnv> = async (c, next) => {
  const db = c.get('db') || getDb(c.env.DB);
  const deviceKey = c.req.header('x-device-key');
  const bearerToken = extractBearerToken(c.req.header('authorization'));
  const merchantIdHeader = c.req.header('x-merchant-id');

  if (deviceKey) {
    const pepper = c.env.ENCRYPTION_PEPPER || '';
    const keyHash = await hashDeviceApiKey(deviceKey.trim(), pepper);

    // 1. Check per-device key in merchant_devices first
    const deviceConditions = merchantIdHeader
      ? and(
          eq(merchantDevices.merchantId, merchantIdHeader),
          eq(merchantDevices.deviceKeyHash, keyHash),
          eq(merchantDevices.isActive, true)
        )
      : and(eq(merchantDevices.deviceKeyHash, keyHash), eq(merchantDevices.isActive, true));

    const deviceRes = await db.select().from(merchantDevices).where(deviceConditions).limit(1);
    const device = deviceRes[0];

    if (device) {
      const merchantRes = await db
        .select()
        .from(merchants)
        .where(and(eq(merchants.id, device.merchantId), eq(merchants.isActive, true)))
        .limit(1);

      const merchant = merchantRes[0];
      if (!merchant) {
        throw new UnauthorizedError('Merchant is inactive or not found');
      }

      await db
        .update(merchantDevices)
        .set({ lastSeenAt: new Date() })
        .where(eq(merchantDevices.id, device.id));

      c.set('merchant', merchant);
      c.set('merchantId', merchant.id);
      if (device.userId) {
        c.set('userId', device.userId);
      }
      await next();
      return;
    }

    // 2. Fallback to legacy merchants.device_api_key_hash
    const merchantConditions = merchantIdHeader
      ? and(
          eq(merchants.id, merchantIdHeader),
          eq(merchants.deviceApiKeyHash, keyHash),
          eq(merchants.isActive, true)
        )
      : and(eq(merchants.deviceApiKeyHash, keyHash), eq(merchants.isActive, true));

    const results = await db.select().from(merchants).where(merchantConditions).limit(1);
    const merchant = results[0];

    if (!merchant) {
      throw new UnauthorizedError('Invalid device API key or merchant is inactive');
    }

    c.set('merchant', merchant);
    c.set('merchantId', merchant.id);
    await next();
    return;
  }

  if (bearerToken && bearerToken.split('.').length === 3) {
    await authenticateJwtSession(c, db, bearerToken, merchantIdHeader);
    await next();
    return;
  }

  throw new UnauthorizedError('Missing device API key header (X-Device-Key) or Bearer JWT');
};

/**
 * Combined Middleware accepting either Merchant Auth (Secret / JWT) or Device Auth (X-Device-Key / JWT).
 */
export const authMerchantOrDeviceMiddleware: MiddlewareHandler<AppContextEnv> = async (c, next) => {
  const deviceKey = c.req.header('x-device-key');
  if (deviceKey) {
    return authDeviceMiddleware(c, next);
  }
  return authMerchantMiddleware(c, next);
};

/**
 * Master Admin Key Middleware
 * Validates 'X-Admin-Key' against MASTER_ADMIN_KEY.
 */
export const authMasterAdminMiddleware: MiddlewareHandler<AppContextEnv> = async (c, next) => {
  const adminKey = c.req.header('x-admin-key');
  const expectedKey = c.env.MASTER_ADMIN_KEY;

  if (!expectedKey) {
    throw new AppError('MASTER_ADMIN_KEY is not configured on this environment', 500, 'ADMIN_NOT_CONFIGURED');
  }

  if (!adminKey || adminKey !== expectedKey) {
    throw new UnauthorizedError('Invalid or missing administrative key (X-Admin-Key)');
  }

  await next();
};

/**
 * Global Hono Error Handler
 */
export const errorHandler: ErrorHandler<AppContextEnv> = (err, c) => {
  console.error('[API Error]:', err);

  if (err instanceof ZodError) {
    return c.json(
      {
        success: false,
        error: {
          message: 'Input validation failed',
          code: 'VALIDATION_ERROR',
          details: err.issues.map((issue) => ({
            path: issue.path.join('.'),
            message: issue.message,
          })),
        },
      },
      400
    );
  }

  if (err instanceof AppError) {
    return c.json(
      {
        success: false,
        error: {
          message: err.message,
          code: err.code,
          details: err.details,
        },
      },
      err.statusCode as any
    );
  }

  return c.json(
    {
      success: false,
      error: {
        message: err.message || 'Internal server error',
        code: 'INTERNAL_SERVER_ERROR',
      },
    },
    500
  );
};
