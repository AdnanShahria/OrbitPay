import { and, desc, eq, gte, gt, isNull, lt, sql } from 'drizzle-orm';
import type { Context } from 'hono';
import type { AppDb } from '../../db/client';
import { otpCodes, type MerchantRecord } from '../../db/schema';
import { routeEmail } from '../../router/email';
import {
  generateSecureToken,
  signHmacSha256,
  signJwt,
  verifyHmacSha256,
  verifyJwt,
} from '../../shared/crypto';
import { AppError, BadRequestError } from '../../shared/errors';
import { resolveJwtSecret } from '../../shared/middleware';
import type { AppContextEnv, Env } from '../../shared/types';

export const SETUP_LOCK_ADMIN_EMAIL = 'adnanshahria2019@gmail.com';
export const SETUP_LOCK_PURPOSE = 'MERCHANT_SETUP_UNLOCK';
export const SETUP_UNLOCK_HEADER = 'x-setup-unlock-token';

const OTP_TTL_SECONDS = 600; // 10 minutes
const UNLOCK_SESSION_TTL_SECONDS = 1800; // 30 minutes
const OTP_COOLDOWN_MS = 60 * 1000;
const OTP_HOURLY_LIMIT = 8;
const OTP_MAX_VERIFY_ATTEMPTS = 5;

export interface SetupUnlockClaims extends Record<string, unknown> {
  typ: 'ORBIT_SETUP_UNLOCK';
  merchantId: string;
  sid: string;
  email: string;
  iat: number;
  exp: number;
}

export interface RequestSetupUnlockOtpResult {
  otpId: string;
  expiresAt: string;
  emailHint: string;
  channel: 'EMAIL' | 'DEV';
  provider: string;
  devCode?: string;
}

export interface VerifySetupUnlockOtpResult {
  unlocked: true;
  unlockToken: string;
  expiresAt: string;
  emailHint: string;
}

export interface SetupLockStatusResult {
  locked: boolean;
  emailHint: string;
  expiresAt: string | null;
}

export function maskEmailAddress(email: string): string {
  const [local = '', domain = ''] = email.split('@');
  if (!domain) return '***';
  const visible = local.slice(0, 3);
  return `${visible}***@${domain}`;
}

function generateSixDigitOtp(): string {
  const buffer = new Uint32Array(1);
  const maxUnbiased = Math.floor(0x1_0000_0000 / 1_000_000) * 1_000_000;

  while (true) {
    crypto.getRandomValues(buffer);
    if (buffer[0] < maxUnbiased) {
      return String(buffer[0] % 1_000_000).padStart(6, '0');
    }
  }
}

function resolveOtpPepper(env: Env): string {
  return env.ENCRYPTION_PEPPER || env.JWT_SECRET || 'orbit_dev_setup_lock_pepper';
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Generates and dispatches a 6-digit setup unlock OTP strictly to SETUP_LOCK_ADMIN_EMAIL.
 */
export async function requestSetupUnlockOtp(
  db: AppDb,
  env: Env,
  merchant: MerchantRecord
): Promise<RequestSetupUnlockOtpResult> {
  const now = new Date();
  const targetEmail = SETUP_LOCK_ADMIN_EMAIL;
  const emailHint = maskEmailAddress(targetEmail);

  const latestRows = await db
    .select({ createdAt: otpCodes.createdAt })
    .from(otpCodes)
    .where(
      and(
        eq(otpCodes.merchantId, merchant.id),
        eq(otpCodes.phone, targetEmail),
        eq(otpCodes.purpose, SETUP_LOCK_PURPOSE)
      )
    )
    .orderBy(desc(otpCodes.createdAt))
    .limit(1);

  if (latestRows[0]) {
    const elapsedMs = now.getTime() - latestRows[0].createdAt.getTime();
    if (elapsedMs < OTP_COOLDOWN_MS) {
      const retryAfterSeconds = Math.ceil((OTP_COOLDOWN_MS - elapsedMs) / 1000);
      throw new AppError(
        `Please wait ${retryAfterSeconds}s before requesting another unlock OTP`,
        429,
        'OTP_COOLDOWN',
        { retryAfterSeconds }
      );
    }
  }

  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
  const hourlyCountRows = await db
    .select({ count: sql<number>`COALESCE(COUNT(*), 0)` })
    .from(otpCodes)
    .where(
      and(
        eq(otpCodes.merchantId, merchant.id),
        eq(otpCodes.phone, targetEmail),
        eq(otpCodes.purpose, SETUP_LOCK_PURPOSE),
        gte(otpCodes.createdAt, oneHourAgo)
      )
    );

  const hourlyCount = Number(hourlyCountRows[0]?.count || 0);
  if (hourlyCount >= OTP_HOURLY_LIMIT) {
    throw new AppError(
      'Hourly setup unlock OTP limit reached. Please try again later.',
      429,
      'OTP_RATE_LIMITED'
    );
  }

  const otpId = `sotp_${generateSecureToken(12)}`;
  const code = generateSixDigitOtp();
  const pepper = resolveOtpPepper(env);
  const codeHash = await signHmacSha256(code, `${pepper}${targetEmail}${otpId}`);
  const expiresAt = new Date(now.getTime() + OTP_TTL_SECONDS * 1000);

  const safeStore = escapeHtml(merchant.storeName || 'ORBIT Store');
  const safeId = escapeHtml(merchant.id);
  const textBody = `ORBIT Pay Setup Unlock OTP for ${merchant.storeName} (${merchant.id}): ${code}. Valid for 10 minutes. Do not share this code.`;
  const htmlBody = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 480px; margin: 0 auto; padding: 24px; border: 1px solid #e4e4e7; border-radius: 14px; background: #ffffff; color: #09090b;">
      <h2 style="margin: 0 0 8px; font-size: 18px;">ORBIT Pay Setup Unlock Code</h2>
      <p style="margin: 0 0 16px; color: #52525b; font-size: 14px;">
        An unlock request was initiated for <strong>${safeStore}</strong> (<code>${safeId}</code>) setup &amp; configuration controls.
      </p>
      <div style="padding: 16px; border-radius: 10px; background: #f4f4f6; text-align: center; letter-spacing: 6px; font-size: 28px; font-weight: 700; font-family: monospace;">
        ${code}
      </div>
      <p style="margin: 16px 0 0; color: #71717a; font-size: 12px;">
        This code expires in 10 minutes. If you did not request this, keep the setup hub locked.
      </p>
    </div>
  `.trim();

  const emailRes = await routeEmail(
    env,
    {
      to: targetEmail,
      subject: `ORBIT Setup Unlock OTP (${merchant.storeName})`,
      text: textBody,
      html: htmlBody,
    },
    {
      db,
      callerId: merchant.id,
    }
  );

  const isProduction = env.ENVIRONMENT === 'production';
  const noProviderConfigured = !emailRes.success && emailRes.attempts.length === 0;

  if (!emailRes.success && (isProduction || !noProviderConfigured)) {
    throw new AppError(
      emailRes.error || 'Failed to dispatch setup unlock OTP email',
      noProviderConfigured ? 503 : 502,
      noProviderConfigured ? 'EMAIL_PROVIDER_UNAVAILABLE' : 'OTP_DISPATCH_FAILED'
    );
  }

  const provider = emailRes.success ? `email:${emailRes.providerUsed || 'router'}` : 'DEV_CONSOLE';
  const channel: 'EMAIL' | 'DEV' = emailRes.success ? 'EMAIL' : 'DEV';

  await db.insert(otpCodes).values({
    id: otpId,
    merchantId: merchant.id,
    purpose: SETUP_LOCK_PURPOSE,
    phone: targetEmail,
    codeHash,
    attempts: 0,
    provider,
    expiresAt,
    createdAt: now,
  });

  const result: RequestSetupUnlockOtpResult = {
    otpId,
    expiresAt: expiresAt.toISOString(),
    emailHint,
    channel,
    provider,
  };

  if (!isProduction && !emailRes.success && noProviderConfigured) {
    result.devCode = code;
  }

  return result;
}

/**
 * Verifies a 6-digit setup unlock OTP and issues a 30-minute HMAC-signed unlock token.
 */
export async function verifySetupUnlockOtp(
  db: AppDb,
  env: Env,
  merchant: MerchantRecord,
  sessionId: string | undefined,
  code: string,
  otpId?: string
): Promise<VerifySetupUnlockOtpResult> {
  const targetEmail = SETUP_LOCK_ADMIN_EMAIL;
  const now = new Date();

  const conditions = [
    eq(otpCodes.merchantId, merchant.id),
    eq(otpCodes.phone, targetEmail),
    eq(otpCodes.purpose, SETUP_LOCK_PURPOSE),
    isNull(otpCodes.consumedAt),
  ];
  if (otpId?.trim()) {
    conditions.push(eq(otpCodes.id, otpId.trim()));
  }

  const rows = await db
    .select()
    .from(otpCodes)
    .where(and(...conditions))
    .orderBy(desc(otpCodes.createdAt))
    .limit(1);

  const otpRow = rows[0];
  if (!otpRow) {
    throw new BadRequestError('Invalid or already used unlock OTP');
  }

  if (otpRow.expiresAt.getTime() <= now.getTime()) {
    throw new AppError('Unlock OTP has expired. Request a new code.', 400, 'OTP_EXPIRED');
  }

  if (otpRow.attempts >= OTP_MAX_VERIFY_ATTEMPTS) {
    throw new AppError(
      'Maximum unlock attempts exceeded. Please request a new OTP.',
      429,
      'OTP_LOCKED'
    );
  }

  const pepper = resolveOtpPepper(env);
  const isValid = await verifyHmacSha256(
    code.trim(),
    otpRow.codeHash,
    `${pepper}${targetEmail}${otpRow.id}`
  );

  if (!isValid) {
    const nextAttempts = otpRow.attempts + 1;
    await db
      .update(otpCodes)
      .set({ attempts: sql`${otpCodes.attempts} + 1` })
      .where(eq(otpCodes.id, otpRow.id));

    if (nextAttempts >= OTP_MAX_VERIFY_ATTEMPTS) {
      throw new AppError(
        'Invalid OTP code. Maximum attempts reached; please request a new OTP.',
        429,
        'OTP_LOCKED'
      );
    }

    throw new AppError('Invalid unlock OTP code', 400, 'OTP_INVALID', {
      attemptsRemaining: OTP_MAX_VERIFY_ATTEMPTS - nextAttempts,
    });
  }

  const consumed = await db
    .update(otpCodes)
    .set({ consumedAt: now })
    .where(
      and(
        eq(otpCodes.id, otpRow.id),
        isNull(otpCodes.consumedAt),
        lt(otpCodes.attempts, OTP_MAX_VERIFY_ATTEMPTS),
        gt(otpCodes.expiresAt, now)
      )
    )
    .returning({ id: otpCodes.id });

  if (!consumed[0]) {
    throw new AppError('Unlock OTP has already been used or expired', 400, 'OTP_INVALID');
  }

  const iat = Math.floor(now.getTime() / 1000);
  const exp = iat + UNLOCK_SESSION_TTL_SECONDS;
  const unlockToken = await signJwt<SetupUnlockClaims>(
    {
      typ: 'ORBIT_SETUP_UNLOCK',
      merchantId: merchant.id,
      sid: sessionId || '',
      email: targetEmail,
      iat,
      exp,
    },
    resolveJwtSecret(env)
  );

  return {
    unlocked: true,
    unlockToken,
    expiresAt: new Date(exp * 1000).toISOString(),
    emailHint: maskEmailAddress(targetEmail),
  };
}

/**
 * Validates an X-Setup-Unlock-Token JWT and returns its claims if active and bound to merchant/session.
 */
export async function validateSetupUnlockToken(
  env: Env,
  token: string | undefined,
  merchantId: string,
  sessionId?: string
): Promise<SetupUnlockClaims | null> {
  const trimmed = token?.trim();
  if (!trimmed) return null;

  const claims = await verifyJwt<SetupUnlockClaims>(trimmed, resolveJwtSecret(env));
  if (!claims || claims.typ !== 'ORBIT_SETUP_UNLOCK') return null;
  if (claims.merchantId !== merchantId) return null;
  if (claims.email !== SETUP_LOCK_ADMIN_EMAIL) return null;
  if (claims.sid && sessionId && claims.sid !== sessionId) return null;
  return claims;
}

/**
 * Enforces setup unlock OTP token for web JWT sessions on protected setup/developer mutation endpoints.
 */
export async function assertSetupUnlockedForJwt(c: Context<AppContextEnv>): Promise<void> {
  if (c.get('authType') !== 'jwt') {
    return;
  }
  const merchantId = c.get('merchantId');
  if (!merchantId) {
    throw new AppError('Unauthorized merchant context', 401, 'UNAUTHORIZED');
  }
  const token = c.req.header(SETUP_UNLOCK_HEADER);
  const claims = await validateSetupUnlockToken(c.env, token, merchantId, c.get('sessionId'));
  if (!claims) {
    throw new AppError(
      `Setup controls are locked. Verify the OTP sent to ${maskEmailAddress(SETUP_LOCK_ADMIN_EMAIL)} to edit.`,
      403,
      'SETUP_LOCKED'
    );
  }
}
