import { eq, and, desc, asc } from 'drizzle-orm';
import type { AppDb } from '../../db/client';
import {
  merchantWallets,
  type MerchantWalletRecord,
  type MfsProvider,
  MFS_PROVIDERS,
} from '../../db/schema';
import { generateSecureToken } from '../../shared/crypto';
import { NotFoundError } from '../../shared/errors';
import type { CreateWalletInput, UpdateWalletInput } from './wallets.schema';

/**
 * Retrieves the optimal active SIM wallet for a provider, honoring the monthly quota rotation.
 * Priority:
 * 1. Under monthly quota limit (currentMonthVolume < monthlyVolumeLimit)
 * 2. Primary designated SIM first (isPrimary = true)
 * 3. Priority order (priorityOrder ASC)
 * 4. Fallback to any active SIM if all are currently over quota
 */
export async function getActiveRotatedWallet(
  db: AppDb,
  merchantId: string,
  provider: MfsProvider
): Promise<MerchantWalletRecord | null> {
  const activeWallets = await db
    .select()
    .from(merchantWallets)
    .where(
      and(
        eq(merchantWallets.merchantId, merchantId),
        eq(merchantWallets.provider, provider),
        eq(merchantWallets.isActive, true)
      )
    )
    .orderBy(desc(merchantWallets.isPrimary), asc(merchantWallets.priorityOrder));

  if (activeWallets.length === 0) {
    return null;
  }

  // Find first SIM strictly under monthly quota
  const underQuotaWallet = activeWallets.find(
    (w) => w.currentMonthVolume < w.monthlyVolumeLimit
  );

  // Return under-quota wallet or gracefully fall back to the primary/first active SIM
  return underQuotaWallet || activeWallets[0];
}

/**
 * Returns active rotated wallet map for all supported providers for a merchant.
 */
export async function getAllActiveRotatedWallets(
  db: AppDb,
  merchantId: string
): Promise<MerchantWalletRecord[]> {
  const results: MerchantWalletRecord[] = [];
  for (const provider of MFS_PROVIDERS) {
    const wallet = await getActiveRotatedWallet(db, merchantId, provider);
    if (wallet) {
      results.push(wallet);
    }
  }
  return results;
}

/**
 * Lists all registered wallets for a merchant.
 */
export async function listWallets(db: AppDb, merchantId: string): Promise<MerchantWalletRecord[]> {
  return db
    .select()
    .from(merchantWallets)
    .where(eq(merchantWallets.merchantId, merchantId))
    .orderBy(desc(merchantWallets.isActive), desc(merchantWallets.isPrimary), asc(merchantWallets.priorityOrder));
}

/**
 * Creates and registers a new SIM wallet.
 */
export async function createWallet(
  db: AppDb,
  merchantId: string,
  input: CreateWalletInput
): Promise<MerchantWalletRecord> {
  const id = `wal_${generateSecureToken(16)}`;

  // If this wallet is marked primary, demote any other primary wallet for the same provider
  if (input.isPrimary) {
    await db
      .update(merchantWallets)
      .set({ isPrimary: false })
      .where(
        and(
          eq(merchantWallets.merchantId, merchantId),
          eq(merchantWallets.provider, input.provider),
          eq(merchantWallets.isPrimary, true)
        )
      );
  }

  await db.insert(merchantWallets).values({
    id,
    merchantId,
    provider: input.provider,
    accountType: input.accountType,
    walletNumber: input.walletNumber,
    monthlyVolumeLimit: input.monthlyVolumeLimit,
    currentMonthVolume: 0,
    isPrimary: input.isPrimary,
    isActive: true,
    priorityOrder: input.priorityOrder,
  });

  const created = await db.select().from(merchantWallets).where(eq(merchantWallets.id, id)).limit(1);
  return created[0];
}

/**
 * Updates wallet parameters or toggle active/primary states.
 */
export async function updateWallet(
  db: AppDb,
  merchantId: string,
  walletId: string,
  input: UpdateWalletInput
): Promise<MerchantWalletRecord> {
  const existing = await db
    .select()
    .from(merchantWallets)
    .where(and(eq(merchantWallets.id, walletId), eq(merchantWallets.merchantId, merchantId)))
    .limit(1);

  if (!existing[0]) {
    throw new NotFoundError(`Wallet ${walletId} not found`);
  }

  const current = existing[0];

  // If setting to primary, demote existing primaries for the same provider
  if (input.isPrimary) {
    await db
      .update(merchantWallets)
      .set({ isPrimary: false })
      .where(
        and(
          eq(merchantWallets.merchantId, merchantId),
          eq(merchantWallets.provider, current.provider),
          eq(merchantWallets.isPrimary, true)
        )
      );
  }

  await db
    .update(merchantWallets)
    .set({
      ...(input.walletNumber !== undefined && { walletNumber: input.walletNumber }),
      ...(input.accountType !== undefined && { accountType: input.accountType }),
      ...(input.monthlyVolumeLimit !== undefined && { monthlyVolumeLimit: input.monthlyVolumeLimit }),
      ...(input.currentMonthVolume !== undefined && { currentMonthVolume: input.currentMonthVolume }),
      ...(input.isPrimary !== undefined && { isPrimary: input.isPrimary }),
      ...(input.isActive !== undefined && { isActive: input.isActive }),
      ...(input.priorityOrder !== undefined && { priorityOrder: input.priorityOrder }),
    })
    .where(eq(merchantWallets.id, walletId));

  const updated = await db.select().from(merchantWallets).where(eq(merchantWallets.id, walletId)).limit(1);
  return updated[0];
}

/**
 * Deletes a wallet.
 */
export async function deleteWallet(db: AppDb, merchantId: string, walletId: string): Promise<void> {
  const existing = await db
    .select()
    .from(merchantWallets)
    .where(and(eq(merchantWallets.id, walletId), eq(merchantWallets.merchantId, merchantId)))
    .limit(1);

  if (!existing[0]) {
    throw new NotFoundError(`Wallet ${walletId} not found`);
  }

  await db.delete(merchantWallets).where(eq(merchantWallets.id, walletId));
}

/**
 * Increments monthly volume for the wallet associated with a verified transaction.
 */
export async function incrementWalletVolume(
  db: AppDb,
  merchantId: string,
  provider: MfsProvider,
  amount: number,
  walletNumber?: string
): Promise<void> {
  let targetWallet: MerchantWalletRecord | null = null;

  if (walletNumber) {
    const match = await db
      .select()
      .from(merchantWallets)
      .where(
        and(
          eq(merchantWallets.merchantId, merchantId),
          eq(merchantWallets.provider, provider),
          eq(merchantWallets.walletNumber, walletNumber)
        )
      )
      .limit(1);
    targetWallet = match[0] || null;
  }

  if (!targetWallet) {
    targetWallet = await getActiveRotatedWallet(db, merchantId, provider);
  }

  if (targetWallet) {
    await db
      .update(merchantWallets)
      .set({
        currentMonthVolume: targetWallet.currentMonthVolume + amount,
      })
      .where(eq(merchantWallets.id, targetWallet.id));
  }
}
