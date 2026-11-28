import { eq, desc, sql, and, isNull, asc, inArray } from 'drizzle-orm';
import { ensureRuntimeSchema } from '../../db/bootstrap';
import type { AppDb } from '../../db/client';
import {
  merchants,
  merchantWallets,
  merchantUsers,
  merchantDevices,
  merchantOrders,
  authSessions,
  smsLedger,
  verificationQueue,
  webhookDeliveries,
  checkoutSessions,
  paymentIntents,
  paymentLinks,
  consumedTrxIds,
  otpCodes,
  mediaAssets,
  type AccountMode,
  type MerchantRecord,
  type MfsProvider,
  type VerificationMode,
} from '../../db/schema';
import {
  generateMerchantApiKey,
  generatePublishableKey,
  generateSecureToken,
  hashDeviceApiKey,
  hashPassword,
  hashSha256,
} from '../../shared/crypto';
import { BadRequestError, ConflictError, NotFoundError } from '../../shared/errors';
import { sanitizePhoneNumber } from '../../shared/parsers/mfs';
import {
  ensureUniqueMerchantSlug,
  resolveAndPersistMerchantSlug,
  toSafeMerchantSlug,
} from '../../shared/slug';
import { getMerchantPushHubStatus } from '../../router/push-hub';
import type { Env } from '../../shared/types';
import { formatPaymentIntentView } from '../payments/payments.service';
import { recordAdminAudit, type AdminActor } from './admin-auth.service';
import type {
  CreateProjectDTO,
  UpdateProjectDTO,
  CreateProjectUserDTO,
} from './admin.schema';

const PASSWORD_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$';

/**
 * Generates a cryptographically random 12-character temporary password.
 */
function generateTempPassword(length = 12): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = '';
  for (let i = 0; i < length; i++) {
    out += PASSWORD_ALPHABET[bytes[i] % PASSWORD_ALPHABET.length];
  }
  return out;
}

export interface AdminProjectSummary {
  id: string;
  storeName: string;
  slug: string;
  webhookUrl: string;
  webhookSecret: string;
  gracePeriodMinutes: number;
  isActive: boolean;
  accountMode: AccountMode;
  verificationMode: VerificationMode;
  ignoreStorefrontSync: boolean;
  lastSeenAt: Date | null;
  createdAt: Date;
  isOnline: boolean;
  walletsCount: number;
  paymentLinksCount: number;
  totalVolume: number;
  verifiedCount: number;
  unclaimedCount: number;
}

export interface AdminOverviewStats {
  totalProjects: number;
  activeProjects: number;
  totalVolume: number;
  totalTransactions: number;
  verifiedTransactions: number;
  unclaimedTransactions: number;
  onlineDevices: number;
  totalWallets: number;
  pendingQueueCount: number;
  webhookSuccessRate: number;
  totalWebhooksSent: number;
}

/**
 * Computes aggregated system-wide KPIs across all tenants.
 */
export async function getAdminOverview(db: AppDb): Promise<AdminOverviewStats> {
  const allMerchants = await db.select().from(merchants);
  const now = Date.now();
  const onlineThresholdMs = 5 * 60 * 1000;

  let activeProjects = 0;
  let onlineDevices = 0;
  for (const m of allMerchants) {
    if (m.isActive) activeProjects++;
    if (m.lastSeenAt && now - m.lastSeenAt.getTime() < onlineThresholdMs) {
      onlineDevices++;
    }
  }

  // Aggregate SMS Ledger stats
  const ledgerStats = await db
    .select({
      totalCount: sql<number>`count(*)`,
      verifiedCount: sql<number>`sum(case when status in ('VERIFIED', 'MANUAL_VERIFIED') then 1 else 0 end)`,
      unclaimedCount: sql<number>`sum(case when status = 'UNCLAIMED' then 1 else 0 end)`,
      totalVolume: sql<number>`coalesce(sum(case when status in ('VERIFIED', 'MANUAL_VERIFIED') then amount else 0 end), 0)`,
    })
    .from(smsLedger);

  const row = ledgerStats[0] || {
    totalCount: 0,
    verifiedCount: 0,
    unclaimedCount: 0,
    totalVolume: 0,
  };

  // Wallets count
  const walletRows = await db
    .select({ count: sql<number>`count(*)` })
    .from(merchantWallets)
    .where(eq(merchantWallets.isActive, true));

  // Verification queue count
  const queueRows = await db
    .select({ count: sql<number>`count(*)` })
    .from(verificationQueue)
    .where(eq(verificationQueue.status, 'WAITING_FOR_SMS'));

  // Webhook delivery stats
  const webhookStats = await db
    .select({
      total: sql<number>`count(*)`,
      delivered: sql<number>`sum(case when status = 'DELIVERED' then 1 else 0 end)`,
    })
    .from(webhookDeliveries);

  const totalWebhooks = webhookStats[0]?.total || 0;
  const deliveredWebhooks = webhookStats[0]?.delivered || 0;
  const webhookSuccessRate = totalWebhooks > 0 ? Math.round((deliveredWebhooks / totalWebhooks) * 100) : 100;

  return {
    totalProjects: allMerchants.length,
    activeProjects,
    totalVolume: Number(row.totalVolume) || 0,
    totalTransactions: Number(row.totalCount) || 0,
    verifiedTransactions: Number(row.verifiedCount) || 0,
    unclaimedTransactions: Number(row.unclaimedCount) || 0,
    onlineDevices,
    totalWallets: Number(walletRows[0]?.count) || 0,
    pendingQueueCount: Number(queueRows[0]?.count) || 0,
    webhookSuccessRate,
    totalWebhooksSent: totalWebhooks,
  };
}

/**
 * Returns all connected client projects with per-tenant telemetry.
 */
export async function getAdminProjects(db: AppDb, env?: Env): Promise<AdminProjectSummary[]> {
  const allMerchants = await db.select().from(merchants).orderBy(desc(merchants.createdAt));
  const now = Date.now();
  const onlineThresholdMs = 5 * 60 * 1000;

  return Promise.all(
    allMerchants.map(async (m) => {
      const recentHeartbeat = m.lastSeenAt
        ? now - m.lastSeenAt.getTime() < onlineThresholdMs
        : false;

      const [wallets, linksCount, stats, slug, pushStatus] = await Promise.all([
        db
          .select({ count: sql<number>`count(*)` })
          .from(merchantWallets)
          .where(and(eq(merchantWallets.merchantId, m.id), eq(merchantWallets.isActive, true))),
        db
          .select({ count: sql<number>`count(*)` })
          .from(paymentLinks)
          .where(eq(paymentLinks.merchantId, m.id)),
        db
          .select({
            verifiedCount: sql<number>`sum(case when status in ('VERIFIED', 'MANUAL_VERIFIED') then 1 else 0 end)`,
            unclaimedCount: sql<number>`sum(case when status = 'UNCLAIMED' then 1 else 0 end)`,
            totalVolume: sql<number>`coalesce(sum(case when status in ('VERIFIED', 'MANUAL_VERIFIED') then amount else 0 end), 0)`,
          })
          .from(smsLedger)
          .where(eq(smsLedger.merchantId, m.id)),
        resolveAndPersistMerchantSlug(db, m),
        env?.PUSH_HUB ? getMerchantPushHubStatus(env, m.id) : Promise.resolve(null),
      ]);

      const hasLiveAndroidSocket = pushStatus
        ? (pushStatus.androidSockets ?? pushStatus.activeSockets) > 0
        : false;
      const s = stats[0] || { verifiedCount: 0, unclaimedCount: 0, totalVolume: 0 };

      return {
        id: m.id,
        storeName: m.storeName,
        slug,
        webhookUrl: m.webhookUrl,
        webhookSecret: m.webhookSecret,
        gracePeriodMinutes: m.gracePeriodMinutes,
        isActive: m.isActive,
        accountMode: m.accountMode,
        verificationMode: m.verificationMode,
        ignoreStorefrontSync: m.ignoreStorefrontSync,
        lastSeenAt: m.lastSeenAt,
        createdAt: m.createdAt,
        isOnline: recentHeartbeat || hasLiveAndroidSocket,
        walletsCount: Number(wallets[0]?.count) || 0,
        paymentLinksCount: Number(linksCount[0]?.count) || 0,
        totalVolume: Number(s.totalVolume) || 0,
        verifiedCount: Number(s.verifiedCount) || 0,
        unclaimedCount: Number(s.unclaimedCount) || 0,
      };
    })
  );
}

/**
 * Onboards a new client project / merchant store.
 */
export async function createAdminProject(
  db: AppDb,
  input: CreateProjectDTO,
  pepper: string,
  origin = 'https://payment.orbitsaas.cloud'
) {
  await ensureRuntimeSchema(db);

  const accountMode: AccountMode = input.accountMode ?? 'WEBHOOK_CONNECTED';
  const verificationMode: VerificationMode = input.verificationMode ?? 'AUTO';
  const gracePeriodMinutes = input.gracePeriodMinutes ?? 60;
  const ignoreStorefrontSync = input.ignoreStorefrontSync ?? accountMode === 'STANDALONE';
  const enabledModulesJson = JSON.stringify({
    ecommerce_fulfillment: accountMode === 'WEBHOOK_CONNECTED',
    phone_otp: false,
    telegram_alerts: false,
  });

  const shouldCreateStarterLink =
    Boolean(input.createStarterPaymentLink) ||
    (accountMode === 'STANDALONE' && input.createStarterPaymentLink !== false);
  const starterAmountType = input.starterLinkAmountType || 'OPEN';
  if (
    shouldCreateStarterLink &&
    starterAmountType === 'FIXED' &&
    (!input.starterLinkAmount || input.starterLinkAmount <= 0)
  ) {
    throw new BadRequestError('Starter payment link fixed amount must be greater than 0');
  }

  const merchantId = input.id || `mer_live_${generateSecureToken(8).toLowerCase()}`;
  const rawDeviceKey = `dev_key_${generateSecureToken(24)}`;
  const deviceKeyHash = await hashDeviceApiKey(rawDeviceKey, pepper);
  const webhookSecret = `whsec_${generateSecureToken(24)}`;
  const rawApiKey = generateMerchantApiKey();
  const apiKeyHash = await hashSha256(rawApiKey);
  const apiKeyPrefix = rawApiKey.slice(0, 12);
  const publishableKey = generatePublishableKey();

  const now = new Date();

  const existingMerchant = await db
    .select({ id: merchants.id })
    .from(merchants)
    .where(eq(merchants.id, merchantId))
    .limit(1);

  if (existingMerchant[0]) {
    throw new ConflictError(`A project with ID '${merchantId}' already exists`);
  }

  if (input.ownerEmail) {
    const normalizedEmail = input.ownerEmail.toLowerCase();
    const existingUser = await db
      .select({ id: merchantUsers.id })
      .from(merchantUsers)
      .where(sql`lower(${merchantUsers.email}) = ${normalizedEmail}`)
      .limit(1);

    if (existingUser[0]) {
      throw new ConflictError(`A user with email '${normalizedEmail}' already exists`);
    }
  }

  const merchantSlug = await ensureUniqueMerchantSlug(db, input.slug || input.storeName);

  const merchantInsert = db.insert(merchants).values({
    id: merchantId,
    storeName: input.storeName,
    slug: merchantSlug,
    webhookUrl: input.webhookUrl || '',
    webhookSecret,
    deviceApiKeyHash: deviceKeyHash,
    apiKeyHash,
    apiKeyPrefix,
    publishableKey,
    gracePeriodMinutes,
    accountMode,
    ignoreStorefrontSync,
    verificationMode,
    enabledModulesJson,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  });

  const extraBatchItems: Array<
    | ReturnType<typeof db.insert<typeof merchantWallets>>
    | ReturnType<typeof db.insert<typeof paymentLinks>>
    | ReturnType<typeof db.insert<typeof merchantUsers>>
  > = [];

  if (input.initialWallets && input.initialWallets.length > 0) {
    const explicitPrimaryProviders = new Set<MfsProvider>();
    for (const w of input.initialWallets) {
      if (w.isPrimary) explicitPrimaryProviders.add(w.provider);
    }
    const assignedPrimaryProviders = new Set<MfsProvider>();

    const initialWalletRows = input.initialWallets.map((w, idx) => {
      let isPrimary = false;
      if (explicitPrimaryProviders.has(w.provider)) {
        if (w.isPrimary && !assignedPrimaryProviders.has(w.provider)) {
          isPrimary = true;
          assignedPrimaryProviders.add(w.provider);
        }
      } else if (!assignedPrimaryProviders.has(w.provider)) {
        isPrimary = true;
        assignedPrimaryProviders.add(w.provider);
      }

      return {
        id: `wal_${generateSecureToken(16)}`,
        merchantId,
        provider: w.provider,
        accountType: w.accountType ?? ('PERSONAL' as const),
        walletNumber: sanitizePhoneNumber(w.walletNumber, w.provider),
        label: w.label ?? null,
        safeVolumeLimit: 250000,
        monthlyVolumeLimit: 300000,
        currentMonthVolume: 0,
        isPrimary,
        isActive: true,
        source: 'PERSONAL' as const,
        priorityOrder: idx + 1,
      };
    });

    extraBatchItems.push(db.insert(merchantWallets).values(initialWalletRows) as any);
  }

  let starterPaymentLink:
    | {
        id: string;
        slug: string;
        title: string;
        sharePath: string;
        shareUrl: string;
      }
    | undefined;

  if (shouldCreateStarterLink) {
    const linkId = `lnk_${generateSecureToken(14)}`;
    const linkSlug = 'pay';
    const linkTitle = input.starterLinkTitle?.trim() || `${input.storeName} Pay`;
    const fixedAmount = starterAmountType === 'FIXED' ? input.starterLinkAmount! : null;
    const minAmount = starterAmountType === 'OPEN' ? 10 : null;
    const cleanOrigin = origin.replace(/\/+$/, '');
    const sharePath = `/${merchantSlug}/${linkSlug}`;
    const shareUrl = `${cleanOrigin}${sharePath}`;

    extraBatchItems.push(
      db.insert(paymentLinks).values({
        id: linkId,
        merchantId,
        slug: linkSlug,
        title: linkTitle,
        vertical: 'custom',
        amountType: starterAmountType,
        fixedAmount,
        minAmount,
        currency: 'BDT',
        displayJson: JSON.stringify({
          appName: input.storeName,
          category: 'custom',
          title: linkTitle,
        }),
        isActive: true,
        usedCount: 0,
        createdAt: now,
        updatedAt: now,
      }) as any
    );

    starterPaymentLink = {
      id: linkId,
      slug: linkSlug,
      title: linkTitle,
      sharePath,
      shareUrl,
    };
  }

  let ownerAccount:
    | { id: string; email: string; fullName: string; password: string; role: 'MERCHANT_OWNER' }
    | undefined;

  try {
    if (input.ownerEmail) {
      const ownerEmail = input.ownerEmail.toLowerCase();
      const ownerPassword = input.ownerPassword || generateTempPassword(12);
      const ownerName = input.ownerName || `${input.storeName} Owner`;
      const ownerId = `usr_${generateSecureToken(12)}`;
      const passwordHash = await hashPassword(ownerPassword);

      extraBatchItems.push(
        db.insert(merchantUsers).values({
          id: ownerId,
          merchantId,
          email: ownerEmail,
          fullName: ownerName,
          passwordHash,
          role: 'MERCHANT_OWNER',
          isActive: true,
          createdAt: now,
          updatedAt: now,
        }) as any
      );

      ownerAccount = {
        id: ownerId,
        email: ownerEmail,
        fullName: ownerName,
        password: ownerPassword,
        role: 'MERCHANT_OWNER',
      };
    }

    await db.batch([merchantInsert, ...(extraBatchItems as any[])]);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('UNIQUE constraint failed: merchants.id')) {
      throw new ConflictError(`A project with ID '${merchantId}' already exists`);
    }
    if (msg.includes('UNIQUE constraint failed: merchant_users.email')) {
      throw new ConflictError(`A user with email '${input.ownerEmail?.toLowerCase()}' already exists`);
    }
    throw err;
  }

  return {
    id: merchantId,
    storeName: input.storeName,
    slug: merchantSlug,
    webhookUrl: input.webhookUrl || '',
    webhookSecret,
    apiKey: rawApiKey,
    publishableKey,
    deviceKey: rawDeviceKey,
    gracePeriodMinutes,
    accountMode,
    verificationMode,
    ignoreStorefrontSync,
    ...(starterPaymentLink ? { starterPaymentLink } : {}),
    ...(ownerAccount ? { ownerAccount } : {}),
  };
}

/**
 * Updates a project's configuration or toggles active status.
 */
export async function updateAdminProject(
  db: AppDb,
  id: string,
  input: UpdateProjectDTO
) {
  const existingRows = await db.select().from(merchants).where(eq(merchants.id, id)).limit(1);
  const existing = existingRows[0];
  if (!existing) {
    throw new NotFoundError(`Project '${id}' not found`);
  }

  const updateData: Partial<MerchantRecord> = {
    updatedAt: new Date(),
  };

  if (input.storeName !== undefined) updateData.storeName = input.storeName;
  if (input.slug !== undefined) {
    updateData.slug = await ensureUniqueMerchantSlug(db, toSafeMerchantSlug(input.slug), id);
  }
  if (input.webhookUrl !== undefined) updateData.webhookUrl = input.webhookUrl;
  if (input.gracePeriodMinutes !== undefined) updateData.gracePeriodMinutes = input.gracePeriodMinutes;
  if (input.isActive !== undefined) updateData.isActive = input.isActive;
  if (input.accountMode !== undefined) updateData.accountMode = input.accountMode;
  if (input.verificationMode !== undefined) updateData.verificationMode = input.verificationMode;
  if (input.ignoreStorefrontSync !== undefined) {
    updateData.ignoreStorefrontSync = input.ignoreStorefrontSync;
  }
  if (input.ecommerceEnabled !== undefined) {
    let modules: Record<string, boolean> = {
      ecommerce_fulfillment: true,
      phone_otp: false,
      telegram_alerts: false,
    };
    try {
      const parsed = existing.enabledModulesJson ? JSON.parse(existing.enabledModulesJson) : {};
      modules = {
        ecommerce_fulfillment: parsed.ecommerce_fulfillment !== false,
        phone_otp: Boolean(parsed.phone_otp),
        telegram_alerts: Boolean(parsed.telegram_alerts),
      };
    } catch {
      // keep default
    }
    modules.ecommerce_fulfillment = input.ecommerceEnabled;
    updateData.enabledModulesJson = JSON.stringify(modules);
  }

  await db.update(merchants).set(updateData).where(eq(merchants.id, id));

  const updated = await db.select().from(merchants).where(eq(merchants.id, id)).limit(1);
  return updated[0];
}

/**
 * Queries all cross-project webhook delivery records.
 */
export async function getAdminWebhooks(db: AppDb) {
  return await db
    .select({
      id: webhookDeliveries.id,
      merchantId: webhookDeliveries.merchantId,
      eventType: webhookDeliveries.eventType,
      externalOrderId: webhookDeliveries.externalOrderId,
      attemptCount: webhookDeliveries.attemptCount,
      status: webhookDeliveries.status,
      responseStatus: webhookDeliveries.responseStatus,
      responseBody: webhookDeliveries.responseBody,
      lastAttemptAt: webhookDeliveries.lastAttemptAt,
      deliveredAt: webhookDeliveries.deliveredAt,
      nextRetryAt: webhookDeliveries.nextRetryAt,
      storeName: merchants.storeName,
      webhookUrl: merchants.webhookUrl,
    })
    .from(webhookDeliveries)
    .leftJoin(merchants, eq(webhookDeliveries.merchantId, merchants.id))
    .orderBy(desc(webhookDeliveries.lastAttemptAt))
    .limit(50);
}

/**
 * Queries the global verification queue across all stores.
 */
export async function getAdminQueue(db: AppDb) {
  return await db
    .select({
      id: verificationQueue.id,
      merchantId: verificationQueue.merchantId,
      provider: verificationQueue.provider,
      externalOrderId: verificationQueue.externalOrderId,
      customerEmail: verificationQueue.customerEmail,
      expectedAmount: verificationQueue.expectedAmount,
      submittedTrxId: verificationQueue.submittedTrxId,
      submittedSender: verificationQueue.submittedSender,
      status: verificationQueue.status,
      expiresAt: verificationQueue.expiresAt,
      createdAt: verificationQueue.createdAt,
      storeName: merchants.storeName,
    })
    .from(verificationQueue)
    .leftJoin(merchants, eq(verificationQueue.merchantId, merchants.id))
    .where(eq(verificationQueue.status, 'WAITING_FOR_SMS'))
    .orderBy(desc(verificationQueue.createdAt))
    .limit(50);
}

/**
 * Lists provisioned users and recent JWT auth sessions for a specific project/merchant.
 */
export async function getProjectUsersAndSessions(db: AppDb, merchantId: string) {
  const merchantRes = await db
    .select({ id: merchants.id, storeName: merchants.storeName })
    .from(merchants)
    .where(eq(merchants.id, merchantId))
    .limit(1);

  if (!merchantRes[0]) {
    throw new NotFoundError(`Project '${merchantId}' not found`);
  }

  const [users, sessions] = await Promise.all([
    db
      .select({
        id: merchantUsers.id,
        merchantId: merchantUsers.merchantId,
        email: merchantUsers.email,
        fullName: merchantUsers.fullName,
        role: merchantUsers.role,
        isActive: merchantUsers.isActive,
        lastLoginAt: merchantUsers.lastLoginAt,
        createdAt: merchantUsers.createdAt,
        updatedAt: merchantUsers.updatedAt,
      })
      .from(merchantUsers)
      .where(eq(merchantUsers.merchantId, merchantId))
      .orderBy(desc(merchantUsers.createdAt)),
    db
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
      })
      .from(authSessions)
      .leftJoin(merchantUsers, eq(authSessions.userId, merchantUsers.id))
      .where(eq(authSessions.merchantId, merchantId))
      .orderBy(desc(authSessions.createdAt))
      .limit(50),
  ]);

  return {
    project: merchantRes[0],
    users,
    sessions,
  };
}

/**
 * Creates a new merchant user under a specific project (admin-provisioned only).
 */
export async function createProjectUser(
  db: AppDb,
  merchantId: string,
  input: CreateProjectUserDTO
) {
  const merchantRes = await db
    .select({ id: merchants.id })
    .from(merchants)
    .where(eq(merchants.id, merchantId))
    .limit(1);

  if (!merchantRes[0]) {
    throw new NotFoundError(`Project '${merchantId}' not found`);
  }

  const normalizedEmail = input.email.toLowerCase();
  const existing = await db
    .select({ id: merchantUsers.id })
    .from(merchantUsers)
    .where(sql`lower(${merchantUsers.email}) = ${normalizedEmail}`)
    .limit(1);

  if (existing[0]) {
    throw new ConflictError(`A user with email '${normalizedEmail}' already exists`);
  }

  const rawPassword = input.password || generateTempPassword(12);
  const passwordHash = await hashPassword(rawPassword);
  const userId = `usr_${generateSecureToken(12)}`;
  const now = new Date();

  await db.insert(merchantUsers).values({
    id: userId,
    merchantId,
    email: normalizedEmail,
    fullName: input.fullName,
    passwordHash,
    role: input.role,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  });

  return {
    id: userId,
    merchantId,
    email: normalizedEmail,
    fullName: input.fullName,
    role: input.role,
    password: rawPassword,
    isActive: true,
    createdAt: now,
  };
}

/**
 * Resets a merchant user's password and revokes all of their active JWT sessions.
 */
export async function resetProjectUserPassword(
  db: AppDb,
  userId: string,
  newPassword?: string
) {
  const userRes = await db
    .select({
      id: merchantUsers.id,
      email: merchantUsers.email,
      merchantId: merchantUsers.merchantId,
    })
    .from(merchantUsers)
    .where(eq(merchantUsers.id, userId))
    .limit(1);

  const user = userRes[0];
  if (!user) {
    throw new NotFoundError(`User '${userId}' not found`);
  }

  const rawPassword = newPassword || generateTempPassword(12);
  const passwordHash = await hashPassword(rawPassword);
  const now = new Date();

  await db
    .update(merchantUsers)
    .set({ passwordHash, updatedAt: now })
    .where(eq(merchantUsers.id, userId));

  await db
    .update(authSessions)
    .set({ revokedAt: now })
    .where(and(eq(authSessions.userId, userId), isNull(authSessions.revokedAt)));

  await db
    .update(merchantDevices)
    .set({ isActive: false })
    .where(and(eq(merchantDevices.userId, userId), eq(merchantDevices.isActive, true)));

  return {
    userId: user.id,
    merchantId: user.merchantId,
    email: user.email,
    password: rawPassword,
    sessionsRevoked: true,
  };
}

/**
 * Revokes an auth session immediately.
 */
export async function revokeAdminSession(db: AppDb, sessionId: string) {
  const existing = await db
    .select({ id: authSessions.id })
    .from(authSessions)
    .where(eq(authSessions.id, sessionId))
    .limit(1);

  if (!existing[0]) {
    throw new NotFoundError(`Session '${sessionId}' not found`);
  }

  const now = new Date();
  await db
    .update(authSessions)
    .set({ revokedAt: now })
    .where(and(eq(authSessions.id, sessionId), isNull(authSessions.revokedAt)));

  return {
    sessionId,
    revokedAt: now.toISOString(),
  };
}

/**
 * Returns deep inspection telemetry for a single connected project/merchant.
 */
export async function inspectAdminProject(db: AppDb, projectId: string) {
  await ensureRuntimeSchema(db);
  const merchantRes = await db
    .select()
    .from(merchants)
    .where(eq(merchants.id, projectId))
    .limit(1);

  const merchant = merchantRes[0];
  if (!merchant) {
    throw new NotFoundError(`Project '${projectId}' not found`);
  }

  const { deviceApiKeyHash: _deviceHash, apiKeyHash: _apiKeyHash, ...safeProject } = merchant;
  const merchantSlug = await resolveAndPersistMerchantSlug(db, merchant);

  const [wallets, links, pendingIntentRows, recentTransactions, recentOrders, recentQueue] =
    await Promise.all([
      db
        .select()
        .from(merchantWallets)
        .where(eq(merchantWallets.merchantId, projectId))
        .orderBy(asc(merchantWallets.priorityOrder)),
      db
        .select()
        .from(paymentLinks)
        .where(eq(paymentLinks.merchantId, projectId))
        .orderBy(desc(paymentLinks.createdAt))
        .limit(50),
      db
        .select()
        .from(paymentIntents)
        .where(
          and(
            eq(paymentIntents.merchantId, projectId),
            inArray(paymentIntents.status, ['MANUAL_REVIEW_REQUIRED', 'WAITING_FOR_SMS', 'OPEN'])
          )
        )
        .orderBy(desc(paymentIntents.createdAt))
        .limit(30),
      db
        .select()
        .from(smsLedger)
        .where(eq(smsLedger.merchantId, projectId))
        .orderBy(desc(smsLedger.smsReceivedAt))
        .limit(20),
      db
        .select()
        .from(merchantOrders)
        .where(eq(merchantOrders.merchantId, projectId))
        .orderBy(desc(merchantOrders.createdAt))
        .limit(15),
      db
        .select()
        .from(verificationQueue)
        .where(eq(verificationQueue.merchantId, projectId))
        .orderBy(desc(verificationQueue.createdAt))
        .limit(15),
    ]);

  return {
    project: {
      ...safeProject,
      slug: merchantSlug,
    },
    wallets,
    paymentLinks: links.map((link) => ({
      ...link,
      merchantSlug,
      sharePath: `/${merchantSlug}/${link.slug}`,
    })),
    pendingIntents: pendingIntentRows.map((intent) =>
      formatPaymentIntentView(intent, merchant.storeName)
    ),
    recentTransactions,
    recentOrders,
    recentQueue,
  };
}

/**
 * Safely deletes a merchant storefront and all dependent records in FK-safe order.
 */
export async function deleteAdminProject(
  db: AppDb,
  projectId: string,
  actor?: AdminActor
) {
  await ensureRuntimeSchema(db);
  const merchantRes = await db
    .select({ id: merchants.id, storeName: merchants.storeName })
    .from(merchants)
    .where(eq(merchants.id, projectId))
    .limit(1);

  const merchant = merchantRes[0];
  if (!merchant) {
    throw new NotFoundError(`Project '${projectId}' not found`);
  }

  await db.batch([
    db.delete(consumedTrxIds).where(eq(consumedTrxIds.merchantId, projectId)),
    db.delete(webhookDeliveries).where(eq(webhookDeliveries.merchantId, projectId)),
    db.delete(verificationQueue).where(eq(verificationQueue.merchantId, projectId)),
    db.delete(checkoutSessions).where(eq(checkoutSessions.merchantId, projectId)),
    db.delete(paymentIntents).where(eq(paymentIntents.merchantId, projectId)),
    db.delete(paymentLinks).where(eq(paymentLinks.merchantId, projectId)),
    db.delete(merchantOrders).where(eq(merchantOrders.merchantId, projectId)),
    db.delete(smsLedger).where(eq(smsLedger.merchantId, projectId)),
    db.delete(merchantWallets).where(eq(merchantWallets.merchantId, projectId)),
    db.delete(merchantDevices).where(eq(merchantDevices.merchantId, projectId)),
    db.delete(authSessions).where(eq(authSessions.merchantId, projectId)),
    db.delete(merchantUsers).where(eq(merchantUsers.merchantId, projectId)),
    db.delete(otpCodes).where(eq(otpCodes.merchantId, projectId)),
    db.delete(mediaAssets).where(eq(mediaAssets.merchantId, projectId)),
    db.delete(merchants).where(eq(merchants.id, projectId)),
  ]);

  await recordAdminAudit(db, {
    actor,
    action: 'PROJECT_DELETED',
    targetType: 'merchant',
    targetId: projectId,
    metadata: { storeName: merchant.storeName },
  });

  return {
    id: projectId,
    storeName: merchant.storeName,
    deleted: true,
  };
}
