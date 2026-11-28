import { and, desc, eq, sql } from 'drizzle-orm';
import type { AppDb } from '../../db/client';
import {
  merchants,
  paymentLinks,
  type MerchantRecord,
  type PaymentLinkRecord,
} from '../../db/schema';
import { generateSecureToken } from '../../shared/crypto';
import { BadRequestError, ConflictError, NotFoundError } from '../../shared/errors';
import {
  resolveAndPersistMerchantSlug,
  slugifySegment,
  toSafeMerchantSlug,
} from '../../shared/slug';
import type { Env } from '../../shared/types';
import { getPlatformSettings } from '../admin/platform-settings.service';
import { createPaymentIntent } from '../payments/payments.service';
import {
  computeDeviceOnlineStatus,
  parseActionsList,
  parseDisplayMetadata,
} from '../payments/verification.engine';
import { getAllActiveRotatedWallets } from '../wallets/wallets.service';
import type {
  CreatePaymentLinkInput,
  PayPaymentLinkInput,
  UpdatePaymentLinkInput,
} from './payment-links.schema';

function formatLinkView(
  link: PaymentLinkRecord,
  storeName: string,
  merchantSlug: string,
  origin = 'https://payment.orbitsaas.cloud'
) {
  let metadata: Record<string, unknown> | null = null;
  try {
    metadata = link.metadataJson ? JSON.parse(link.metadataJson) : null;
  } catch {
    metadata = null;
  }

  const cleanOrigin = origin.replace(/\/+$/, '');
  const sharePath = `/${merchantSlug}/${link.slug}`;

  return {
    id: link.id,
    merchantId: link.merchantId,
    merchantSlug,
    slug: link.slug,
    sharePath,
    shareUrl: `${cleanOrigin}${sharePath}`,
    title: link.title,
    description: link.description,
    vertical: link.vertical,
    amountType: link.amountType,
    fixedAmount: link.fixedAmount,
    minAmount: link.minAmount,
    maxAmount: link.maxAmount,
    currency: link.currency,
    verificationMode: link.verificationMode,
    display: parseDisplayMetadata(link.displayJson, storeName || 'ORBIT Merchant', link.slug),
    actions: parseActionsList(link.actionsJson),
    metadata,
    returnUrl: link.returnUrl,
    cancelUrl: link.cancelUrl,
    isActive: link.isActive,
    maxUses: link.maxUses,
    usedCount: link.usedCount,
    expiresAt: link.expiresAt,
    createdAt: link.createdAt,
    updatedAt: link.updatedAt,
  };
}

function generateDefaultSlug(title: string): string {
  const base = slugifySegment(title, 'pay').slice(0, 32);
  const suffix = generateSecureToken(3).toLowerCase();
  return `${base || 'pay'}-${suffix}`;
}

export async function listPaymentLinks(
  db: AppDb,
  merchant: MerchantRecord,
  origin?: string
) {
  const [merchantSlug, rows] = await Promise.all([
    resolveAndPersistMerchantSlug(db, merchant),
    db
      .select()
      .from(paymentLinks)
      .where(eq(paymentLinks.merchantId, merchant.id))
      .orderBy(desc(paymentLinks.createdAt))
      .limit(100),
  ]);

  return rows.map((row) => formatLinkView(row, merchant.storeName, merchantSlug, origin));
}

export async function getPaymentLinkById(
  db: AppDb,
  merchant: MerchantRecord,
  id: string,
  origin?: string
) {
  const [merchantSlug, rows] = await Promise.all([
    resolveAndPersistMerchantSlug(db, merchant),
    db
      .select()
      .from(paymentLinks)
      .where(and(eq(paymentLinks.id, id), eq(paymentLinks.merchantId, merchant.id)))
      .limit(1),
  ]);

  if (!rows[0]) {
    throw new NotFoundError(`Payment link '${id}' not found`);
  }

  return formatLinkView(rows[0], merchant.storeName, merchantSlug, origin);
}

export async function createPaymentLink(
  db: AppDb,
  merchant: MerchantRecord,
  input: CreatePaymentLinkInput,
  origin?: string
) {
  const slug = input.slug || generateDefaultSlug(input.title);

  const existing = await db
    .select({ id: paymentLinks.id })
    .from(paymentLinks)
    .where(and(eq(paymentLinks.merchantId, merchant.id), eq(paymentLinks.slug, slug)))
    .limit(1);

  if (existing[0]) {
    throw new ConflictError(`Payment link slug '${slug}' is already in use for your store`);
  }

  const now = new Date();
  const id = `lnk_${generateSecureToken(14)}`;

  await db.insert(paymentLinks).values({
    id,
    merchantId: merchant.id,
    slug,
    title: input.title,
    description: input.description || null,
    vertical: input.vertical,
    amountType: input.amountType,
    fixedAmount: input.amountType === 'FIXED' ? input.fixedAmount! : null,
    minAmount: input.minAmount ?? null,
    maxAmount: input.maxAmount ?? null,
    currency: input.currency,
    verificationMode: input.verificationMode ?? null,
    displayJson: input.display
      ? JSON.stringify(input.display)
      : JSON.stringify({
          appName: merchant.storeName,
          category: input.vertical,
          title: input.title,
          subtitle: input.description,
        }),
    actionsJson: input.actions ? JSON.stringify(input.actions) : null,
    metadataJson: input.metadata ? JSON.stringify(input.metadata) : null,
    returnUrl: input.returnUrl || null,
    cancelUrl: input.cancelUrl || null,
    isActive: true,
    maxUses: input.maxUses ?? null,
    usedCount: 0,
    expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
    createdAt: now,
    updatedAt: now,
  });

  return getPaymentLinkById(db, merchant, id, origin);
}

export async function updatePaymentLink(
  db: AppDb,
  merchant: MerchantRecord,
  id: string,
  input: UpdatePaymentLinkInput,
  origin?: string
) {
  const existing = await db
    .select()
    .from(paymentLinks)
    .where(and(eq(paymentLinks.id, id), eq(paymentLinks.merchantId, merchant.id)))
    .limit(1);

  if (!existing[0]) {
    throw new NotFoundError(`Payment link '${id}' not found`);
  }

  if (input.slug !== undefined && input.slug !== existing[0].slug) {
    const duplicate = await db
      .select({ id: paymentLinks.id })
      .from(paymentLinks)
      .where(and(eq(paymentLinks.merchantId, merchant.id), eq(paymentLinks.slug, input.slug)))
      .limit(1);

    if (duplicate[0] && duplicate[0].id !== id) {
      throw new ConflictError(`Payment link slug '${input.slug}' is already in use for your store`);
    }
  }

  await db
    .update(paymentLinks)
    .set({
      ...(input.slug !== undefined && { slug: input.slug }),
      ...(input.title !== undefined && { title: input.title }),
      ...(input.description !== undefined && { description: input.description }),
      ...(input.vertical !== undefined && { vertical: input.vertical }),
      ...(input.amountType !== undefined && { amountType: input.amountType }),
      ...(input.fixedAmount !== undefined && { fixedAmount: input.fixedAmount }),
      ...(input.minAmount !== undefined && { minAmount: input.minAmount }),
      ...(input.maxAmount !== undefined && { maxAmount: input.maxAmount }),
      ...(input.verificationMode !== undefined && { verificationMode: input.verificationMode }),
      ...(input.display !== undefined && { displayJson: JSON.stringify(input.display) }),
      ...(input.actions !== undefined && { actionsJson: JSON.stringify(input.actions) }),
      ...(input.metadata !== undefined && { metadataJson: JSON.stringify(input.metadata) }),
      ...(input.returnUrl !== undefined && { returnUrl: input.returnUrl }),
      ...(input.cancelUrl !== undefined && { cancelUrl: input.cancelUrl }),
      ...(input.isActive !== undefined && { isActive: input.isActive }),
      ...(input.maxUses !== undefined && { maxUses: input.maxUses }),
      ...(input.expiresAt !== undefined && {
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
      }),
      updatedAt: new Date(),
    })
    .where(and(eq(paymentLinks.id, id), eq(paymentLinks.merchantId, merchant.id)));

  return getPaymentLinkById(db, merchant, id, origin);
}

export async function deletePaymentLink(db: AppDb, merchant: MerchantRecord, id: string) {
  const deleted = await db
    .delete(paymentLinks)
    .where(and(eq(paymentLinks.id, id), eq(paymentLinks.merchantId, merchant.id)))
    .returning({ id: paymentLinks.id });

  if (!deleted[0]) {
    throw new NotFoundError(`Payment link '${id}' not found`);
  }

  return { deleted: true, id };
}

async function resolveActiveMerchantBySlug(db: AppDb, merchantSlug: string): Promise<MerchantRecord> {
  const normalized = slugifySegment(merchantSlug, '');
  if (!normalized) {
    throw new NotFoundError('Merchant payment page not found');
  }

  const directRows = await db
    .select()
    .from(merchants)
    .where(and(sql`lower(${merchants.slug}) = ${normalized}`, eq(merchants.isActive, true)))
    .limit(1);

  if (directRows[0]) {
    return directRows[0];
  }

  const activeMerchants = await db
    .select()
    .from(merchants)
    .where(eq(merchants.isActive, true));

  const matched = activeMerchants.find((m) => toSafeMerchantSlug(m.storeName) === normalized);
  if (!matched) {
    throw new NotFoundError(`Store '${merchantSlug}' not found or inactive`);
  }

  const persistedSlug = await resolveAndPersistMerchantSlug(db, matched);
  return { ...matched, slug: persistedSlug };
}

async function loadActivePublicLink(db: AppDb, slug: string, merchantSlug?: string) {
  const normalizedSlug = slug.trim().toLowerCase();

  let link: PaymentLinkRecord | undefined;
  let merchant: MerchantRecord | undefined;

  if (merchantSlug) {
    merchant = await resolveActiveMerchantBySlug(db, merchantSlug);
    const linkRows = await db
      .select()
      .from(paymentLinks)
      .where(and(eq(paymentLinks.merchantId, merchant.id), eq(paymentLinks.slug, normalizedSlug)))
      .limit(1);
    link = linkRows[0];
  } else {
    const rows = await db
      .select()
      .from(paymentLinks)
      .where(eq(paymentLinks.slug, normalizedSlug))
      .limit(1);
    link = rows[0];
    if (link) {
      const merchantRows = await db
        .select()
        .from(merchants)
        .where(and(eq(merchants.id, link.merchantId), eq(merchants.isActive, true)))
        .limit(1);
      merchant = merchantRows[0];
    }
  }

  if (!link || !link.isActive) {
    throw new NotFoundError(`Payment link '${slug}' not found or inactive`);
  }

  if (link.expiresAt && link.expiresAt.getTime() <= Date.now()) {
    throw new BadRequestError('This payment link has expired');
  }

  if (link.maxUses !== null && link.usedCount >= link.maxUses) {
    throw new BadRequestError('This payment link has reached its maximum number of uses');
  }

  if (!merchant) {
    throw new NotFoundError('Merchant associated with this payment link is inactive');
  }

  const resolvedMerchantSlug = await resolveAndPersistMerchantSlug(db, merchant);
  return { link, merchant, merchantSlug: resolvedMerchantSlug };
}

export async function getPublicPaymentLink(
  db: AppDb,
  env: Env,
  slug: string,
  origin?: string,
  merchantSlug?: string
) {
  const { link, merchant, merchantSlug: resolvedMerchantSlug } = await loadActivePublicLink(
    db,
    slug,
    merchantSlug
  );
  const [wallets, deviceStatus, platformConfig] = await Promise.all([
    getAllActiveRotatedWallets(db, merchant.id, env),
    computeDeviceOnlineStatus(db, env, merchant),
    getPlatformSettings(db),
  ]);

  return {
    ...formatLinkView(link, merchant.storeName, resolvedMerchantSlug, origin),
    storeName: merchant.storeName,
    merchantSlug: resolvedMerchantSlug,
    effectiveVerificationMode: link.verificationMode ?? merchant.verificationMode,
    receiptPolicy: merchant.receiptPolicy,
    deviceStatus,
    platformConfig,
    activeWallets: wallets.map((w) => ({
      provider: w.provider,
      walletNumber: w.walletNumber,
      accountType: w.accountType,
      isPrimary: w.isPrimary,
    })),
  };
}

export async function payPublicPaymentLink(
  db: AppDb,
  env: Env,
  slug: string,
  input: PayPaymentLinkInput,
  origin: string,
  merchantSlug?: string
) {
  const { link, merchant, merchantSlug: resolvedMerchantSlug } = await loadActivePublicLink(
    db,
    slug,
    merchantSlug
  );

  let amount: number;
  if (link.amountType === 'FIXED') {
    amount = link.fixedAmount!;
  } else {
    if (!input.amount || input.amount <= 0) {
      throw new BadRequestError('Amount is required for open-amount payment links');
    }
    if (link.minAmount !== null && input.amount < link.minAmount) {
      throw new BadRequestError(`Minimum amount is ৳${link.minAmount}`);
    }
    if (link.maxAmount !== null && input.amount > link.maxAmount) {
      throw new BadRequestError(`Maximum amount is ৳${link.maxAmount}`);
    }
    amount = input.amount;
  }

  const externalRefId = `lnk_${link.slug}_${generateSecureToken(6).toUpperCase()}`;
  const display = parseDisplayMetadata(link.displayJson, merchant.storeName, externalRefId);
  const actions = parseActionsList(link.actionsJson).map((action) => ({
    ...action,
    style: action.style ?? ('secondary' as const),
  }));

  const intentResult = await createPaymentIntent(
    db,
    env,
    merchant,
    {
      externalRefId,
      vertical: link.vertical,
      amount,
      currency: link.currency,
      provider: input.provider,
      verificationMode: link.verificationMode ?? merchant.verificationMode,
      returnUrl: link.returnUrl || undefined,
      cancelUrl: link.cancelUrl || undefined,
      expiresInMinutes: 15,
      customer: {
        name: input.customerName,
        email: input.customerEmail || undefined,
        phone: input.customerPhone || undefined,
      },
      display: {
        appName: display.appName || merchant.storeName,
        appDomain: display.appDomain,
        referenceLabel: display.referenceLabel || 'Link',
        title: link.title,
        subtitle: input.referenceNote || display.subtitle || link.description || undefined,
        highlights: display.highlights,
        adminDeepLink: display.adminDeepLink,
      },
      actions,
      metadata: {
        paymentLinkId: link.id,
        paymentLinkSlug: link.slug,
        paymentLinkTitle: link.title,
        merchantSlug: resolvedMerchantSlug,
        sharePath: `/${resolvedMerchantSlug}/${link.slug}`,
        ...(input.referenceNote ? { referenceNote: input.referenceNote } : {}),
      },
    },
    origin
  );

  await db
    .update(paymentLinks)
    .set({
      usedCount: sql`${paymentLinks.usedCount} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(paymentLinks.id, link.id));

  return intentResult;
}
