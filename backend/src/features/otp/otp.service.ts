import { and, desc, eq, gte, gt, isNull, lt, sql } from 'drizzle-orm';
import type { AppDb } from '../../db/client';
import { otpCodes, type MerchantRecord } from '../../db/schema';
import { routeEmail } from '../../router/email';
import { routeSmsOrPush } from '../../router/sms';
import { generateSecureToken, signHmacSha256, verifyHmacSha256 } from '../../shared/crypto';
import { AppError, BadRequestError, ValidationError } from '../../shared/errors';
import type { Env } from '../../shared/types';
import type { SendOtpInput, VerifyOtpInput } from './otp.schema';

const DEFAULT_OTP_TTL_SECONDS = 300;
const MAX_OTP_TTL_SECONDS = 3600;
const OTP_COOLDOWN_MS = 60 * 1000;
const OTP_HOURLY_LIMIT = 5;
const OTP_MAX_VERIFY_ATTEMPTS = 5;

export interface SendOtpResult {
  otpId: string;
  expiresAt: string;
  provider: string;
  channel: 'SMS' | 'EMAIL' | 'DEV';
  devCode?: string;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export interface VerifyOtpResult {
  verified: true;
}

/**
 * Normalizes a Bangladesh mobile number to 11-digit `01XXXXXXXXX` format.
 */
export function normalizeBdPhone(rawPhone: string): string {
  const digits = rawPhone.replace(/[\s\-().+]/g, '');
  const normalized = digits.startsWith('8801') && digits.length === 13 ? digits.slice(2) : digits;

  if (!/^01\d{9}$/.test(normalized)) {
    throw new ValidationError('Invalid Bangladesh phone number. Expected 01XXXXXXXXX format.');
  }
  return normalized;
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
  return env.ENCRYPTION_PEPPER || env.JWT_SECRET || 'orbit_dev_otp_pepper';
}

function resolveOtpTtlSeconds(env: Env): number {
  const parsed = Number(env.OTP_TTL_SECONDS);
  if (Number.isFinite(parsed) && parsed > 0) {
    return Math.min(Math.floor(parsed), MAX_OTP_TTL_SECONDS);
  }
  return DEFAULT_OTP_TTL_SECONDS;
}

function buildOtpMessage(
  storeName: string,
  code: string,
  ttlSeconds: number,
  template?: string
): string {
  const validMinutes = Math.max(1, Math.round(ttlSeconds / 60));
  if (!template) {
    return `${storeName} verification code: ${code}. Valid ${validMinutes} minutes. Do not share. -ORBIT`;
  }

  let rendered = template
    .replace(/\{storeName\}/g, storeName)
    .replace(/\{minutes\}/g, String(validMinutes));

  if (rendered.includes('{code}')) {
    rendered = rendered.replace(/\{code\}/g, code);
  } else {
    rendered = `${rendered}: ${code}`;
  }
  return rendered;
}

/**
 * Generates, rate-limits, hashes, persists, and dispatches a 6-digit OTP via SMS.
 */
export async function sendOtp(
  db: AppDb,
  env: Env,
  merchant: MerchantRecord,
  input: SendOtpInput
): Promise<SendOtpResult> {
  const phone = normalizeBdPhone(input.phone);
  const purpose = input.purpose || 'GENERIC';
  const now = new Date();

  // 1. Enforce >= 60s cooldown per (phone, purpose)
  const latestRows = await db
    .select({ createdAt: otpCodes.createdAt })
    .from(otpCodes)
    .where(and(eq(otpCodes.phone, phone), eq(otpCodes.purpose, purpose)))
    .orderBy(desc(otpCodes.createdAt))
    .limit(1);

  if (latestRows[0]) {
    const elapsedMs = now.getTime() - latestRows[0].createdAt.getTime();
    if (elapsedMs < OTP_COOLDOWN_MS) {
      const retryAfterSeconds = Math.ceil((OTP_COOLDOWN_MS - elapsedMs) / 1000);
      throw new AppError(
        `Please wait ${retryAfterSeconds}s before requesting another OTP`,
        429,
        'OTP_COOLDOWN',
        { retryAfterSeconds }
      );
    }
  }

  // 2. Enforce <= 5 sends per hour per phone
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
  const hourlyCountRows = await db
    .select({ count: sql<number>`COALESCE(COUNT(*), 0)` })
    .from(otpCodes)
    .where(and(eq(otpCodes.phone, phone), gte(otpCodes.createdAt, oneHourAgo)));

  const hourlyCount = Number(hourlyCountRows[0]?.count || 0);
  if (hourlyCount >= OTP_HOURLY_LIMIT) {
    throw new AppError(
      'Hourly OTP send limit reached for this phone number',
      429,
      'OTP_RATE_LIMITED'
    );
  }

  // 3. Generate CSPRNG 6-digit code and compute HMAC-SHA256(code, pepper + phone + id)
  const otpId = `otp_${generateSecureToken(12)}`;
  const code = generateSixDigitOtp();
  const pepper = resolveOtpPepper(env);
  const codeHash = await signHmacSha256(code, `${pepper}${phone}${otpId}`);

  const ttlSeconds = resolveOtpTtlSeconds(env);
  const expiresAt = new Date(now.getTime() + ttlSeconds * 1000);
  const message = buildOtpMessage(merchant.storeName, code, ttlSeconds, input.template);

  // 4. Dispatch SMS via unified SMS router, falling back to Email if provided (never log code or message)
  const smsRes = await routeSmsOrPush(
    env,
    {
      to: phone,
      message,
    },
    {
      db,
      callerId: merchant.id,
    }
  );

  const isProduction = env.ENVIRONMENT === 'production';
  let dispatched = smsRes.success;
  let provider = smsRes.providerUsed || '';
  let channel: 'SMS' | 'EMAIL' | 'DEV' = 'SMS';
  let noProviderConfigured = !smsRes.success && smsRes.attempts.length === 0;
  let lastDispatchError = smsRes.error;

  if (!dispatched && input.email) {
    const emailRes = await routeEmail(
      env,
      {
        to: input.email,
        subject: `${merchant.storeName} Verification Code`,
        text: message,
        html: `<p>${escapeHtml(message)}</p>`,
      },
      {
        db,
        callerId: merchant.id,
      }
    );

    if (emailRes.success) {
      dispatched = true;
      provider = `email:${emailRes.providerUsed || 'router'}`;
      channel = 'EMAIL';
    } else {
      const noEmailProvider = emailRes.attempts.length === 0;
      noProviderConfigured = noProviderConfigured && noEmailProvider;
      lastDispatchError = emailRes.error || lastDispatchError;
    }
  }

  if (!dispatched && (isProduction || !noProviderConfigured)) {
    throw new AppError(
      lastDispatchError || 'Failed to dispatch OTP',
      noProviderConfigured ? 503 : 502,
      noProviderConfigured ? 'SMS_PROVIDER_UNAVAILABLE' : 'OTP_DISPATCH_FAILED'
    );
  }

  if (!dispatched) {
    provider = 'DEV_CONSOLE';
    channel = 'DEV';
  }

  await db.insert(otpCodes).values({
    id: otpId,
    merchantId: merchant.id,
    purpose,
    phone,
    codeHash,
    attempts: 0,
    provider,
    expiresAt,
    createdAt: now,
  });

  const response: SendOtpResult = {
    otpId,
    expiresAt: expiresAt.toISOString(),
    provider,
    channel,
  };

  if (!isProduction && !dispatched && noProviderConfigured) {
    response.devCode = code;
  }

  return response;
}

/**
 * Verifies a 6-digit OTP using constant-time HMAC-SHA256 comparison and atomic single-use consumption.
 */
export async function verifyOtp(
  db: AppDb,
  env: Env,
  merchant: MerchantRecord,
  input: VerifyOtpInput
): Promise<VerifyOtpResult> {
  const phone = normalizeBdPhone(input.phone);
  const purpose = input.purpose || 'GENERIC';
  const now = new Date();

  const conditions = [
    eq(otpCodes.merchantId, merchant.id),
    eq(otpCodes.phone, phone),
    eq(otpCodes.purpose, purpose),
    isNull(otpCodes.consumedAt),
  ];

  if (input.otpId) {
    conditions.push(eq(otpCodes.id, input.otpId));
  }

  const rows = await db
    .select()
    .from(otpCodes)
    .where(and(...conditions))
    .orderBy(desc(otpCodes.createdAt))
    .limit(1);

  const otpRow = rows[0];
  if (!otpRow) {
    throw new BadRequestError('Invalid or already used OTP');
  }

  if (otpRow.expiresAt.getTime() <= now.getTime()) {
    throw new AppError('OTP has expired', 400, 'OTP_EXPIRED');
  }

  if (otpRow.attempts >= OTP_MAX_VERIFY_ATTEMPTS) {
    throw new AppError(
      'Maximum verification attempts exceeded. Please request a new OTP.',
      429,
      'OTP_LOCKED'
    );
  }

  const pepper = resolveOtpPepper(env);
  const isValid = await verifyHmacSha256(
    input.code,
    otpRow.codeHash,
    `${pepper}${phone}${otpRow.id}`
  );

  if (!isValid) {
    const nextAttempts = otpRow.attempts + 1;
    await db
      .update(otpCodes)
      .set({ attempts: sql`${otpCodes.attempts} + 1` })
      .where(eq(otpCodes.id, otpRow.id));

    if (nextAttempts >= OTP_MAX_VERIFY_ATTEMPTS) {
      throw new AppError(
        'Invalid OTP code. Maximum attempts reached; OTP is now locked.',
        429,
        'OTP_LOCKED'
      );
    }

    throw new AppError('Invalid OTP code', 400, 'OTP_INVALID', {
      attemptsRemaining: OTP_MAX_VERIFY_ATTEMPTS - nextAttempts,
    });
  }

  // Atomically mark OTP as consumed so concurrent verify calls cannot reuse it
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
    throw new AppError('OTP has already been used, expired, or locked', 400, 'OTP_INVALID');
  }

  return { verified: true };
}
