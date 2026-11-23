import { eq, desc, and, isNull, sql } from 'drizzle-orm';
import type { AppDb } from '../../db/client';
import {
  merchants,
  merchantUsers,
  authSessions,
  merchantDevices,
} from '../../db/schema';
import {
  verifyPassword,
  signJwt,
  generateSecureToken,
  generateDeviceApiKey,
  hashDeviceApiKey,
} from '../../shared/crypto';
import { UnauthorizedError, NotFoundError } from '../../shared/errors';
import { resolveJwtSecret, type OrbitJwtClaims } from '../../shared/middleware';
import type { Env } from '../../shared/types';
import type { LoginInput } from './auth.schema';

const WEB_SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;
const ANDROID_SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;

export interface SafeUserView {
  id: string;
  merchantId: string;
  email: string;
  fullName: string;
  role: string;
  isActive: boolean;
  lastLoginAt: Date | null;
}

export interface SafeMerchantView {
  id: string;
  storeName: string;
  webhookUrl: string;
  webhookSecret: string;
  gracePeriodMinutes: number;
  fcmToken: string | null;
  lastSeenAt: Date | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

function toSafeUser(u: typeof merchantUsers.$inferSelect): SafeUserView {
  return {
    id: u.id,
    merchantId: u.merchantId,
    email: u.email,
    fullName: u.fullName,
    role: u.role,
    isActive: u.isActive,
    lastLoginAt: u.lastLoginAt,
  };
}

function toSafeMerchant(m: typeof merchants.$inferSelect): SafeMerchantView {
  return {
    id: m.id,
    storeName: m.storeName,
    webhookUrl: m.webhookUrl,
    webhookSecret: m.webhookSecret,
    gracePeriodMinutes: m.gracePeriodMinutes,
    fcmToken: m.fcmToken,
    lastSeenAt: m.lastSeenAt,
    isActive: m.isActive,
    createdAt: m.createdAt,
    updatedAt: m.updatedAt,
  };
}

/**
 * Authenticates a merchant user via email & PBKDF2 password, creates a tracked session,
 * signs an HMAC-SHA256 JWT, and provisions a paired device key for Android logins.
 */
export async function loginUser(
  db: AppDb,
  env: Env,
  input: LoginInput,
  ipAddress?: string
) {
  const normalizedEmail = input.email.trim().toLowerCase();
  const userRes = await db
    .select()
    .from(merchantUsers)
    .where(sql`lower(${merchantUsers.email}) = ${normalizedEmail}`)
    .limit(1);

  const user = userRes[0];
  if (!user || !user.isActive) {
    throw new UnauthorizedError('Invalid email or password');
  }

  const passwordValid = await verifyPassword(input.password, user.passwordHash);
  if (!passwordValid) {
    throw new UnauthorizedError('Invalid email or password');
  }

  const merchantRes = await db
    .select()
    .from(merchants)
    .where(eq(merchants.id, user.merchantId))
    .limit(1);

  const merchant = merchantRes[0];
  if (!merchant || !merchant.isActive) {
    throw new UnauthorizedError('Merchant account is inactive or suspended');
  }

  const now = new Date();
  const ttlSeconds =
    input.deviceType === 'ANDROID' ? ANDROID_SESSION_TTL_SECONDS : WEB_SESSION_TTL_SECONDS;
  const iat = Math.floor(now.getTime() / 1000);
  const exp = iat + ttlSeconds;
  const expiresAt = new Date(exp * 1000);
  const sessionId = `ses_${generateSecureToken(16)}`;
  const deviceName =
    input.deviceName || (input.deviceType === 'ANDROID' ? 'Android Companion' : 'Web Browser');

  await db.insert(authSessions).values({
    id: sessionId,
    userId: user.id,
    merchantId: merchant.id,
    deviceType: input.deviceType,
    deviceName,
    ipAddress: ipAddress || null,
    expiresAt,
    createdAt: now,
  });

  await db
    .update(merchantUsers)
    .set({ lastLoginAt: now, updatedAt: now })
    .where(eq(merchantUsers.id, user.id));

  const jwtClaims: OrbitJwtClaims = {
    sub: user.id,
    merchantId: merchant.id,
    email: user.email,
    role: user.role,
    sid: sessionId,
    deviceType: input.deviceType,
    iat,
    exp,
  };

  const accessToken = await signJwt(jwtClaims, resolveJwtSecret(env));

  let deviceApiKey: string | undefined;
  if (input.deviceType === 'ANDROID') {
    deviceApiKey = generateDeviceApiKey();
    const deviceKeyHash = await hashDeviceApiKey(deviceApiKey, env.ENCRYPTION_PEPPER || '');

    await db.insert(merchantDevices).values({
      id: `dev_${generateSecureToken(12)}`,
      merchantId: merchant.id,
      userId: user.id,
      deviceName,
      deviceKeyHash,
      fcmToken: input.fcmToken || null,
      lastSeenAt: now,
      isActive: true,
      createdAt: now,
    });

    if (input.fcmToken) {
      await db
        .update(merchants)
        .set({ fcmToken: input.fcmToken, lastSeenAt: now, updatedAt: now })
        .where(eq(merchants.id, merchant.id));
    }
  }

  return {
    accessToken,
    sessionId,
    expiresAt: expiresAt.toISOString(),
    ...(deviceApiKey ? { deviceApiKey } : {}),
    user: toSafeUser({ ...user, lastLoginAt: now }),
    merchant: toSafeMerchant(merchant),
  };
}

/**
 * Returns the current authenticated user, active session, and safe merchant profile.
 */
export async function getCurrentAuthContext(
  db: AppDb,
  userId: string,
  sessionId: string,
  merchantId: string
) {
  const [userRes, sessionRes, merchantRes] = await Promise.all([
    db.select().from(merchantUsers).where(eq(merchantUsers.id, userId)).limit(1),
    db.select().from(authSessions).where(eq(authSessions.id, sessionId)).limit(1),
    db.select().from(merchants).where(eq(merchants.id, merchantId)).limit(1),
  ]);

  const user = userRes[0];
  const session = sessionRes[0];
  const merchant = merchantRes[0];

  if (!user || !session || !merchant) {
    throw new NotFoundError('Authenticated session context not found');
  }

  return {
    user: toSafeUser(user),
    session: {
      id: session.id,
      deviceType: session.deviceType,
      deviceName: session.deviceName,
      ipAddress: session.ipAddress,
      expiresAt: session.expiresAt,
      createdAt: session.createdAt,
    },
    merchant: toSafeMerchant(merchant),
  };
}

/**
 * Revokes an active auth session immediately.
 */
export async function revokeSession(db: AppDb, sessionId: string): Promise<void> {
  await db
    .update(authSessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(authSessions.id, sessionId), isNull(authSessions.revokedAt)));
}

/**
 * Lists recent auth sessions for a merchant without exposing any secrets.
 */
export async function listMerchantSessions(db: AppDb, merchantId: string) {
  return db
    .select({
      id: authSessions.id,
      userId: authSessions.userId,
      merchantId: authSessions.merchantId,
      deviceType: authSessions.deviceType,
      deviceName: authSessions.deviceName,
      ipAddress: authSessions.ipAddress,
      expiresAt: authSessions.expiresAt,
      revokedAt: authSessions.revokedAt,
      createdAt: authSessions.createdAt,
      userEmail: merchantUsers.email,
      userName: merchantUsers.fullName,
      userRole: merchantUsers.role,
    })
    .from(authSessions)
    .leftJoin(merchantUsers, eq(authSessions.userId, merchantUsers.id))
    .where(eq(authSessions.merchantId, merchantId))
    .orderBy(desc(authSessions.createdAt))
    .limit(50);
}
