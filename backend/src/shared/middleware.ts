import type { MiddlewareHandler, ErrorHandler, Context } from 'hono';
import { ZodError } from 'zod';
import { eq, and, isNull, gt } from 'drizzle-orm';
import { getDb, type AppDb } from '../db/client';
import { ensureRuntimeSchema } from '../db/bootstrap';
import {
  merchants,
  merchantProjects,
  merchantUsers,
  authSessions,
  merchantDevices,
  adminUsers,
  adminSessions,
  type MerchantProjectRecord,
} from '../db/schema';
import { hashDeviceApiKey, hashSha256, timingSafeEqual, verifyJwt } from './crypto';
import { AppError, ForbiddenError, UnauthorizedError } from './errors';
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

export interface OrbitAdminJwtClaims extends Record<string, unknown> {
  typ: 'ORBIT_ADMIN_JWT';
  sub: string;
  email: string;
  role: 'SUPER_ADMIN' | 'ADMIN_OPERATOR';
  sid: string;
  authMethod: 'PASSWORD' | 'MASTER_KEY';
  iat: number;
  exp: number;
}

/**
 * Resolves the HMAC secret used to sign & verify Orbit JWTs.
 * Fails closed in production if no secret is configured.
 */
export function resolveJwtSecret(env: Env): string {
  const configured =
    env.JWT_SECRET?.trim() ||
    env.ENCRYPTION_PEPPER?.trim() ||
    env.MASTER_ADMIN_KEY?.trim();

  if (configured) {
    return configured;
  }

  if (env.ENVIRONMENT === 'production') {
    throw new AppError(
      'JWT_SECRET (or ENCRYPTION_PEPPER / MASTER_ADMIN_KEY) is not configured in production',
      500,
      'JWT_NOT_CONFIGURED'
    );
  }

  return 'orbit_dev_jwt_secret_2026';
}

/**
 * Resolves the Master Admin Key from environment secrets, falling back to the
 * local development default only in non-production environments.
 */
export function resolveMasterAdminKey(env: Env): string | undefined {
  const configured = env.MASTER_ADMIN_KEY?.trim();
  if (configured) return configured;
  return env.ENVIRONMENT !== 'production' ? 'orbit_master_admin_2026' : undefined;
}

/**
 * Safely schedules a background promise on Cloudflare Worker ExecutionContext.waitUntil(),
 * falling back to detached promise execution with error logging in non-Worker runtimes.
 */
export function safeWaitUntil(
  c: { executionCtx?: { waitUntil(promise: Promise<unknown>): void } } | undefined,
  promise: Promise<unknown>
): void {
  const guarded = promise.catch((err) => {
    console.error('[Background Task Error]:', err);
  });

  try {
    if (c && typeof c.executionCtx?.waitUntil === 'function') {
      c.executionCtx.waitUntil(guarded);
      return;
    }
  } catch {
    // c.executionCtx throws outside Workers fetch lifecycle (e.g. unit tests)
  }

  void guarded;
}

/**
 * Verifies a 3-segment Bearer JWT, ensures the auth_sessions row is active and unrevoked,
 * and loads the active merchant + user context onto Hono variables.
 */
export async function authenticateJwtSession(
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
  c.set('authType', 'jwt');
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

async function attachOptionalProjectContext(
  c: Context<AppContextEnv>,
  db: AppDb,
  merchantId: string,
  projectIdHeader?: string
): Promise<void> {
  if (!projectIdHeader) return;
  const rows = await db
    .select()
    .from(merchantProjects)
    .where(
      and(
        eq(merchantProjects.id, projectIdHeader),
        eq(merchantProjects.merchantId, merchantId),
        eq(merchantProjects.isActive, true)
      )
    )
    .limit(1);

  const project = rows[0];
  if (!project) {
    throw new ForbiddenError('Requested project not found or inactive for this merchant');
  }
  c.set('project', project);
  c.set('projectId', project.id);
}

/**
 * Merchant Authentication Middleware
 * Accepts:
 * - Authorization: Bearer <jwt> (3 dot-separated segments, checked against auth_sessions)
 * - X-Merchant-Api-Key (sk_live_... merchant key or sk_proj_... project-scoped key)
 * - X-Merchant-Secret header (or Authorization: Bearer <webhookSecret>, merchant or project-scoped)
 */
export const authMerchantMiddleware: MiddlewareHandler<AppContextEnv> = async (c, next) => {
  const db = c.get('db') || getDb(c.env.DB);
  const apiKeyHeader = c.req.header('x-merchant-api-key')?.trim();
  const secretHeader = c.req.header('x-merchant-secret')?.trim();
  const bearerToken = extractBearerToken(c.req.header('authorization'));
  const merchantIdHeader = c.req.header('x-merchant-id')?.trim();
  const projectIdHeader = c.req.header('x-project-id')?.trim();

  // 1. Bearer JWT when no API key or webhook secret header is given
  if (!apiKeyHeader && !secretHeader && bearerToken && bearerToken.split('.').length === 3) {
    await authenticateJwtSession(c, db, bearerToken, merchantIdHeader);
    await attachOptionalProjectContext(c, db, c.get('merchantId')!, projectIdHeader);
    await next();
    return;
  }

  // 2. X-Merchant-Api-Key (or Bearer sk_live_... / sk_proj_...)
  const candidateApiKey =
    apiKeyHeader ||
    (bearerToken && (bearerToken.startsWith('sk_live_') || bearerToken.startsWith('sk_proj_'))
      ? bearerToken
      : undefined);

  if (candidateApiKey) {
    const apiKeyHash = await hashSha256(candidateApiKey);
    const apiConditions = merchantIdHeader
      ? and(eq(merchants.id, merchantIdHeader), eq(merchants.apiKeyHash, apiKeyHash), eq(merchants.isActive, true))
      : and(eq(merchants.apiKeyHash, apiKeyHash), eq(merchants.isActive, true));

    const results = await db.select().from(merchants).where(apiConditions).limit(1);
    const merchant = results[0];
    if (merchant) {
      c.set('merchant', merchant);
      c.set('merchantId', merchant.id);
      c.set('authType', 'api_key');
      await attachOptionalProjectContext(c, db, merchant.id, projectIdHeader);
      await next();
      return;
    }

    // Check project-scoped API key (sk_proj_...)
    const projectRows = await db
      .select()
      .from(merchantProjects)
      .where(and(eq(merchantProjects.apiKeyHash, apiKeyHash), eq(merchantProjects.isActive, true)))
      .limit(1);
    const project: MerchantProjectRecord | undefined = projectRows[0];
    if (project) {
      if (projectIdHeader && projectIdHeader !== project.id) {
        throw new ForbiddenError('Project API key cannot access another project');
      }
      const parentConditions = merchantIdHeader
        ? and(eq(merchants.id, project.merchantId), eq(merchants.id, merchantIdHeader), eq(merchants.isActive, true))
        : and(eq(merchants.id, project.merchantId), eq(merchants.isActive, true));
      const parentRows = await db.select().from(merchants).where(parentConditions).limit(1);
      const parentMerchant = parentRows[0];
      if (!parentMerchant) {
        throw new UnauthorizedError('Parent merchant for project API key is inactive or mismatched');
      }

      c.set('merchant', parentMerchant);
      c.set('merchantId', parentMerchant.id);
      c.set('project', project);
      c.set('projectId', project.id);
      c.set('projectAuthScoped', true);
      c.set('authType', 'api_key');
      await next();
      return;
    }

    throw new UnauthorizedError('Invalid merchant API key or merchant is inactive');
  }

  // 3. Fallback to X-Merchant-Secret / Bearer webhookSecret (merchant or project-scoped)
  const secret = secretHeader || bearerToken;
  if (!secret) {
    throw new UnauthorizedError(
      'Missing merchant credentials (X-Merchant-Api-Key, X-Merchant-Secret, or Authorization: Bearer)'
    );
  }

  const conditions = merchantIdHeader
    ? and(eq(merchants.id, merchantIdHeader), eq(merchants.webhookSecret, secret), eq(merchants.isActive, true))
    : and(eq(merchants.webhookSecret, secret), eq(merchants.isActive, true));

  const results = await db.select().from(merchants).where(conditions).limit(1);
  const merchant = results[0];

  if (merchant) {
    c.set('merchant', merchant);
    c.set('merchantId', merchant.id);
    c.set('authType', 'webhook_secret');
    await attachOptionalProjectContext(c, db, merchant.id, projectIdHeader);
    await next();
    return;
  }

  const projectBySecretRows = await db
    .select()
    .from(merchantProjects)
    .where(and(eq(merchantProjects.webhookSecret, secret), eq(merchantProjects.isActive, true)))
    .limit(1);
  const projectBySecret = projectBySecretRows[0];
  if (projectBySecret) {
    if (projectIdHeader && projectIdHeader !== projectBySecret.id) {
      throw new ForbiddenError('Project webhook secret cannot access another project');
    }
    const parentConditions = merchantIdHeader
      ? and(
          eq(merchants.id, projectBySecret.merchantId),
          eq(merchants.id, merchantIdHeader),
          eq(merchants.isActive, true)
        )
      : and(eq(merchants.id, projectBySecret.merchantId), eq(merchants.isActive, true));
    const parentRows = await db.select().from(merchants).where(parentConditions).limit(1);
    const parentMerchant = parentRows[0];
    if (!parentMerchant) {
      throw new UnauthorizedError('Parent merchant for project secret is inactive or mismatched');
    }

    c.set('merchant', parentMerchant);
    c.set('merchantId', parentMerchant.id);
    c.set('project', projectBySecret);
    c.set('projectId', projectBySecret.id);
    c.set('projectAuthScoped', true);
    c.set('authType', 'webhook_secret');
    await next();
    return;
  }

  throw new UnauthorizedError('Invalid merchant credentials or merchant is inactive');
};

/**
 * Android Device Companion Authentication Middleware
 * Accepts EITHER:
 * - Authorization: Bearer <jwt> (3 segments, checked against auth_sessions)
 * - X-Device-Key (checked against merchant_devices.device_key_hash first, falling back to merchants.device_api_key_hash)
 * Updates BOTH merchant_devices.last_seen_at and merchants.last_seen_at on every authenticated device request.
 */
export const authDeviceMiddleware: MiddlewareHandler<AppContextEnv> = async (c, next) => {
  const db = c.get('db') || getDb(c.env.DB);
  const deviceKey = c.req.header('x-device-key')?.trim();
  const bearerToken = extractBearerToken(c.req.header('authorization'));
  const merchantIdHeader = c.req.header('x-merchant-id')?.trim();
  const now = new Date();

  if (bearerToken && bearerToken.split('.').length === 3) {
    await authenticateJwtSession(c, db, bearerToken, merchantIdHeader);
    const merchantId = c.get('merchantId')!;

    await db.update(merchants).set({ lastSeenAt: now }).where(eq(merchants.id, merchantId));

    if (deviceKey) {
      const pepper = c.env.ENCRYPTION_PEPPER || '';
      const keyHash = await hashDeviceApiKey(deviceKey, pepper);
      const deviceRows = await db
        .select({ id: merchantDevices.id })
        .from(merchantDevices)
        .where(
          and(
            eq(merchantDevices.merchantId, merchantId),
            eq(merchantDevices.deviceKeyHash, keyHash),
            eq(merchantDevices.isActive, true)
          )
        )
        .limit(1);

      if (deviceRows[0]) {
        c.set('deviceId', deviceRows[0].id);
        await db
          .update(merchantDevices)
          .set({ lastSeenAt: now })
          .where(eq(merchantDevices.id, deviceRows[0].id));
      }
    }

    await next();
    return;
  }

  if (deviceKey) {
    const pepper = c.env.ENCRYPTION_PEPPER || '';
    const keyHash = await hashDeviceApiKey(deviceKey, pepper);

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

      await Promise.all([
        db.update(merchantDevices).set({ lastSeenAt: now }).where(eq(merchantDevices.id, device.id)),
        db.update(merchants).set({ lastSeenAt: now }).where(eq(merchants.id, merchant.id)),
      ]);

      c.set('merchant', merchant);
      c.set('merchantId', merchant.id);
      c.set('deviceId', device.id);
      c.set('authType', 'device');
      if (device.userId) {
        c.set('userId', device.userId);
      }
      await next();
      return;
    }

    // Fallback to legacy merchants.device_api_key_hash
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

    await db.update(merchants).set({ lastSeenAt: now }).where(eq(merchants.id, merchant.id));

    c.set('merchant', merchant);
    c.set('merchantId', merchant.id);
    c.set('authType', 'device');
    await next();
    return;
  }

  throw new UnauthorizedError('Missing device API key header (X-Device-Key) or Bearer JWT');
};

/**
 * Combined Middleware accepting either Merchant Auth (API Key / Secret / JWT) or Device Auth (X-Device-Key / JWT).
 */
export const authMerchantOrDeviceMiddleware: MiddlewareHandler<AppContextEnv> = async (c, next) => {
  const bearerToken = extractBearerToken(c.req.header('authorization'));
  const deviceKey = c.req.header('x-device-key')?.trim();
  if (deviceKey || (bearerToken && bearerToken.split('.').length === 3)) {
    return authDeviceMiddleware(c, next);
  }
  return authMerchantMiddleware(c, next);
};

/**
 * Blocks MERCHANT_STAFF (and device keys) from owner-only portal/configuration mutations.
 */
export const requireOwnerRoleMiddleware: MiddlewareHandler<AppContextEnv> = async (c, next) => {
  const role = c.get('userRole');
  const authType = c.get('authType');
  if (role === 'MERCHANT_STAFF') {
    throw new ForbiddenError('Merchant owner role required for this action');
  }
  if (authType === 'device') {
    throw new ForbiddenError('Device credentials cannot perform owner-level configuration actions');
  }
  await next();
};

/**
 * Blocks sub-project-scoped credentials (`sk_proj_...` or project webhookSecret)
 * from mutating hub-wide merchant settings, SIM pools, keys, or sibling projects.
 */
export const requireMerchantWideScopeMiddleware: MiddlewareHandler<AppContextEnv> = async (c, next) => {
  if (c.get('projectAuthScoped')) {
    throw new ForbiddenError(
      'Sub-project credentials cannot access hub-wide merchant configuration or sibling projects'
    );
  }
  await next();
};

/**
 * Verifies a 3-segment Master Admin Bearer JWT (`ORBIT_ADMIN_JWT`), ensures the
 * `admin_sessions` row is active and unrevoked, and populates Admin context variables.
 */
export async function authenticateAdminJwt(
  c: Context<AppContextEnv>,
  db: AppDb,
  token: string
): Promise<OrbitAdminJwtClaims> {
  await ensureRuntimeSchema(db);

  const claims = await verifyJwt<OrbitAdminJwtClaims>(token, resolveJwtSecret(c.env));
  if (!claims || claims.typ !== 'ORBIT_ADMIN_JWT' || !claims.sid || !claims.sub) {
    throw new UnauthorizedError('Invalid or expired Admin JWT token');
  }

  const now = new Date();
  const sessionRes = await db
    .select()
    .from(adminSessions)
    .where(
      and(
        eq(adminSessions.id, claims.sid),
        isNull(adminSessions.revokedAt),
        gt(adminSessions.expiresAt, now)
      )
    )
    .limit(1);

  const session = sessionRes[0];
  if (!session) {
    throw new UnauthorizedError('Admin session revoked or expired');
  }

  if (claims.authMethod === 'PASSWORD' && claims.sub !== 'master_admin') {
    const userRes = await db
      .select({ id: adminUsers.id, email: adminUsers.email, role: adminUsers.role })
      .from(adminUsers)
      .where(and(eq(adminUsers.id, claims.sub), eq(adminUsers.isActive, true)))
      .limit(1);

    if (!userRes[0]) {
      throw new UnauthorizedError('Admin account is inactive or not found');
    }
  }

  c.set('adminUserId', claims.sub);
  c.set('adminSessionId', session.id);
  c.set('adminRole', session.role);
  c.set('adminEmail', session.adminEmail || claims.email);
  c.set('adminAuthMethod', 'jwt');

  return claims;
}

/**
 * Master Admin Authentication Middleware
 * Accepts EITHER:
 * - Authorization: Bearer <admin_jwt> (3 dot-separated segments verified against admin_sessions)
 * - X-Admin-Key header (validated in constant time against MASTER_ADMIN_KEY)
 */
export const authMasterAdminMiddleware: MiddlewareHandler<AppContextEnv> = async (c, next) => {
  const db = c.get('db') || getDb(c.env.DB);
  const bearerToken = extractBearerToken(c.req.header('authorization'));

  if (bearerToken && bearerToken.split('.').length === 3) {
    await authenticateAdminJwt(c, db, bearerToken);
    await next();
    return;
  }

  const adminKey = c.req.header('x-admin-key')?.trim();
  const expectedKey = resolveMasterAdminKey(c.env);

  if (!expectedKey) {
    throw new AppError('MASTER_ADMIN_KEY is not configured on this environment', 500, 'ADMIN_NOT_CONFIGURED');
  }

  if (!adminKey || !timingSafeEqual(adminKey, expectedKey)) {
    throw new UnauthorizedError('Invalid or missing Master Admin credentials');
  }

  c.set('adminUserId', 'master_admin');
  c.set('adminRole', 'SUPER_ADMIN');
  c.set('adminEmail', 'master-key@orbit.internal');
  c.set('adminAuthMethod', 'master_key');

  await next();
};

/**
 * Restricts sensitive hub operations (admin user management, logout-all, project deletion)
 * to SUPER_ADMIN accounts or Master Key sessions.
 */
export const requireSuperAdminMiddleware: MiddlewareHandler<AppContextEnv> = async (c, next) => {
  const authMethod = c.get('adminAuthMethod');
  const role = c.get('adminRole');
  if (authMethod === 'master_key' || role === 'SUPER_ADMIN') {
    await next();
    return;
  }
  throw new ForbiddenError('Super Admin role required for this action');
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
