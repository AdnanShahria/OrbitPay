import { and, eq, ne, sql } from 'drizzle-orm';
import type { AppDb } from '../db/client';
import { merchants, type MerchantRecord } from '../db/schema';
import { generateSecureToken } from './crypto';

export const RESERVED_ROUTE_SEGMENTS = new Set([
  'admin',
  'checkout',
  'l',
  'api',
  'assets',
  'health',
  'widget',
  'public',
  'auth',
  'static',
  'app',
  'favicon.ico',
  'robots.txt',
]);

/**
 * Normalizes any store name or slug input into a clean URL-safe lowercase path segment.
 */
export function slugifySegment(raw: string, fallback = 'merchant'): string {
  const cleaned = raw
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);

  return cleaned || fallback;
}

/**
 * Converts a store name or desired handle into a non-reserved merchant path slug.
 */
export function toSafeMerchantSlug(raw: string): string {
  const base = slugifySegment(raw, 'merchant');
  if (RESERVED_ROUTE_SEGMENTS.has(base)) {
    return `${base}-pay`;
  }
  return base;
}

/**
 * Finds an available unique merchant slug in D1, appending a numeric/short suffix if taken.
 */
export async function ensureUniqueMerchantSlug(
  db: AppDb,
  desiredRaw: string,
  excludeMerchantId?: string
): Promise<string> {
  const base = toSafeMerchantSlug(desiredRaw);

  for (let i = 0; i < 12; i++) {
    const candidate =
      i === 0
        ? base
        : i < 8
          ? `${base}-${i + 1}`
          : `${base}-${generateSecureToken(2).toLowerCase()}`;

    const whereCond = excludeMerchantId
      ? and(sql`lower(${merchants.slug}) = ${candidate}`, ne(merchants.id, excludeMerchantId))
      : sql`lower(${merchants.slug}) = ${candidate}`;

    const existing = await db
      .select({ id: merchants.id })
      .from(merchants)
      .where(whereCond)
      .limit(1);

    if (!existing[0]) {
      return candidate;
    }
  }

  return `${base}-${generateSecureToken(4).toLowerCase()}`;
}

/**
 * Returns the merchant's persisted URL slug, lazily generating and saving one if missing.
 */
export async function resolveAndPersistMerchantSlug(
  db: AppDb,
  merchant: Pick<MerchantRecord, 'id' | 'storeName' | 'slug'>
): Promise<string> {
  if (merchant.slug && merchant.slug.trim().length >= 2) {
    return merchant.slug.trim().toLowerCase();
  }

  const slug = await ensureUniqueMerchantSlug(db, merchant.storeName, merchant.id);
  try {
    await db
      .update(merchants)
      .set({ slug, updatedAt: new Date() })
      .where(eq(merchants.id, merchant.id));
  } catch {
    // Ignore concurrent backfill conflict
  }
  return slug;
}
