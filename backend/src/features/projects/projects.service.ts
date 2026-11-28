import { and, asc, desc, eq, inArray, ne, sql } from 'drizzle-orm';
import type { AppDb } from '../../db/client';
import {
  checkoutSessions,
  merchantOrders,
  merchantProjects,
  merchantProjectWallets,
  merchantWallets,
  paymentIntents,
  paymentLinks,
  verificationQueue,
  webhookDeliveries,
  type AccountMode,
  type MerchantProjectRecord,
  type MerchantRecord,
  type MfsProvider,
  type VerificationMode,
  type WalletSelectionMode,
} from '../../db/schema';
import {
  generateProjectApiKey,
  generatePublishableKey,
  generateSecureToken,
  generateWebhookSecret,
  hashSha256,
} from '../../shared/crypto';
import { BadRequestError, ForbiddenError, NotFoundError } from '../../shared/errors';
import { slugifySegment } from '../../shared/slug';
import { parseAllowedOrigins, validateSafeWebhookUrl } from '../../shared/ssrf';
import type { Env } from '../../shared/types';
import {
  getActiveRotatedWallet,
  getAllActiveRotatedWallets,
  type EnrichedWalletRecord,
} from '../wallets/wallets.service';
import type {
  AdminUpdateSubProjectInput,
  CreateSubProjectInput,
  MerchantUpdateSubProjectInput,
} from './projects.schema';

export interface SafeProjectView {
  id: string;
  merchantId: string;
  name: string;
  slug: string;
  description: string | null;
  accountMode: AccountMode;
  verificationMode: VerificationMode;
  walletSelectionMode: WalletSelectionMode;
  walletIds: string[];
  ignoreStorefrontSync: boolean;
  webhookUrl: string;
  webhookSecret: string;
  apiKeyPrefix: string | null;
  publishableKey: string | null;
  allowedCallbackOrigins: string[];
  telegramConfigured: boolean;
  telegramChatId: string | null;
  isDefault: boolean;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface EffectiveProjectConfig {
  project: MerchantProjectRecord | null;
  projectId: string | null;
  appName: string;
  accountMode: AccountMode;
  verificationMode: VerificationMode;
  ignoreStorefrontSync: boolean;
  webhookUrl: string;
  webhookSecret: string;
  allowedCallbackOrigins: string[];
  telegramBotToken: string | null;
  telegramChatId: string | null;
}

function maskWebhookSecret(secret: string): string {
  if (!secret) return '';
  if (secret.length <= 10) return '••••••••';
  const prefix = secret.startsWith('whsec_') ? 'whsec_' : secret.slice(0, 4);
  return `${prefix}••••••••${secret.slice(-4)}`;
}

async function getAssignedWalletIdsMap(
  db: AppDb,
  projectIds: string[]
): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  if (projectIds.length === 0) return map;

  const rows = await db
    .select({
      projectId: merchantProjectWallets.projectId,
      walletId: merchantProjectWallets.walletId,
    })
    .from(merchantProjectWallets)
    .where(inArray(merchantProjectWallets.projectId, projectIds));

  for (const row of rows) {
    const existing = map.get(row.projectId);
    if (existing) {
      existing.push(row.walletId);
    } else {
      map.set(row.projectId, [row.walletId]);
    }
  }
  return map;
}

export function toSafeProjectView(
  p: MerchantProjectRecord,
  walletIds: string[] = []
): SafeProjectView {
  return {
    id: p.id,
    merchantId: p.merchantId,
    name: p.name,
    slug: p.slug,
    description: p.description ?? null,
    accountMode: p.accountMode,
    verificationMode: p.verificationMode,
    walletSelectionMode: p.walletSelectionMode,
    walletIds,
    ignoreStorefrontSync: p.ignoreStorefrontSync,
    webhookUrl: p.webhookUrl,
    webhookSecret: maskWebhookSecret(p.webhookSecret),
    apiKeyPrefix: p.apiKeyPrefix ?? null,
    publishableKey: p.publishableKey ?? null,
    allowedCallbackOrigins: parseAllowedOrigins(p.allowedCallbackOriginsJson),
    telegramConfigured: Boolean(p.telegramBotToken && p.telegramChatId),
    telegramChatId: p.telegramChatId ?? null,
    isDefault: p.isDefault,
    isActive: p.isActive,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

/**
 * Resolves effective runtime settings (webhookUrl, secret, verificationMode, allowed origins, telegram)
 * by layering the sub-project over the parent merchant account.
 */
export function resolveEffectiveProjectConfig(
  merchant: MerchantRecord,
  project?: MerchantProjectRecord | null
): EffectiveProjectConfig {
  if (!project) {
    return {
      project: null,
      projectId: null,
      appName: merchant.storeName,
      accountMode: merchant.accountMode,
      verificationMode: merchant.verificationMode,
      ignoreStorefrontSync: merchant.ignoreStorefrontSync,
      webhookUrl: merchant.webhookUrl,
      webhookSecret: merchant.webhookSecret,
      allowedCallbackOrigins: parseAllowedOrigins(merchant.allowedCallbackOriginsJson),
      telegramBotToken: merchant.telegramBotToken ?? null,
      telegramChatId: merchant.telegramChatId ?? null,
    };
  }

  const projectOrigins = parseAllowedOrigins(project.allowedCallbackOriginsJson);
  const merchantOrigins = parseAllowedOrigins(merchant.allowedCallbackOriginsJson);
  const mergedOrigins = Array.from(new Set([...projectOrigins, ...merchantOrigins]));

  return {
    project,
    projectId: project.id,
    appName: project.name || merchant.storeName,
    accountMode: project.accountMode,
    verificationMode: project.verificationMode,
    ignoreStorefrontSync: project.ignoreStorefrontSync,
    webhookUrl: project.webhookUrl.trim() ? project.webhookUrl.trim() : merchant.webhookUrl,
    webhookSecret: project.webhookSecret || merchant.webhookSecret,
    allowedCallbackOrigins: mergedOrigins,
    telegramBotToken: project.telegramBotToken?.trim() || merchant.telegramBotToken || null,
    telegramChatId: project.telegramChatId?.trim() || merchant.telegramChatId || null,
  };
}

/**
 * Ensures a unique URL-safe slug within a single merchant's sub-projects.
 */
async function ensureUniqueProjectSlug(
  db: AppDb,
  merchantId: string,
  desiredRaw: string,
  excludeProjectId?: string
): Promise<string> {
  const base = slugifySegment(desiredRaw, 'project');

  for (let i = 0; i < 12; i++) {
    const candidate =
      i === 0
        ? base
        : i < 8
          ? `${base}-${i + 1}`
          : `${base}-${generateSecureToken(2).toLowerCase()}`;

    const cond = excludeProjectId
      ? and(
          eq(merchantProjects.merchantId, merchantId),
          sql`lower(${merchantProjects.slug}) = ${candidate}`,
          ne(merchantProjects.id, excludeProjectId)
        )
      : and(
          eq(merchantProjects.merchantId, merchantId),
          sql`lower(${merchantProjects.slug}) = ${candidate}`
        );

    const existing = await db
      .select({ id: merchantProjects.id })
      .from(merchantProjects)
      .where(cond)
      .limit(1);

    if (!existing[0]) {
      return candidate;
    }
  }

  return `${base}-${generateSecureToken(4).toLowerCase()}`;
}

/**
 * Verifies every requested walletId belongs to `merchantId` (strict anti-IDOR check).
 */
async function validateMerchantWalletIds(
  db: AppDb,
  merchantId: string,
  walletIds: string[]
): Promise<string[]> {
  const uniqueIds = Array.from(new Set(walletIds.map((id) => id.trim()).filter(Boolean)));
  if (uniqueIds.length === 0) return [];

  const matched = await db
    .select({ id: merchantWallets.id })
    .from(merchantWallets)
    .where(and(eq(merchantWallets.merchantId, merchantId), inArray(merchantWallets.id, uniqueIds)));

  if (matched.length !== uniqueIds.length) {
    throw new BadRequestError('One or more selected SIM wallets do not belong to this merchant');
  }

  return uniqueIds;
}

/**
 * Resolves and authorizes a projectId for a request, enforcing pinned project-key isolation.
 */
export async function resolveAuthorizedProject(
  db: AppDb,
  merchantId: string,
  options?: {
    requestedProjectId?: string | null;
    authProject?: MerchantProjectRecord;
    projectAuthScoped?: boolean;
    requireActive?: boolean;
  }
): Promise<MerchantProjectRecord | null> {
  const requestedId = options?.requestedProjectId?.trim() || null;
  const authProject = options?.authProject;
  const requireActive = options?.requireActive !== false;

  if (options?.projectAuthScoped && authProject) {
    if (requestedId && requestedId !== authProject.id) {
      throw new ForbiddenError('Project credentials cannot access or create records for another project');
    }
    return authProject;
  }

  if (requestedId) {
    const cond = requireActive
      ? and(
          eq(merchantProjects.id, requestedId),
          eq(merchantProjects.merchantId, merchantId),
          eq(merchantProjects.isActive, true)
        )
      : and(eq(merchantProjects.id, requestedId), eq(merchantProjects.merchantId, merchantId));
    const rows = await db.select().from(merchantProjects).where(cond).limit(1);
    if (!rows[0]) {
      throw new BadRequestError(`Project '${requestedId}' not found or inactive for this merchant`);
    }
    return rows[0];
  }

  return authProject ?? null;
}

/**
 * Loads a project record by ID scoped strictly to `merchantId`.
 */
export async function loadProjectById(
  db: AppDb,
  merchantId: string,
  projectId: string | null | undefined
): Promise<MerchantProjectRecord | null> {
  if (!projectId) return null;
  const rows = await db
    .select()
    .from(merchantProjects)
    .where(and(eq(merchantProjects.id, projectId), eq(merchantProjects.merchantId, merchantId)))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Resolves project-scoped webhook target, signing secret, allowed callback origins,
 * and Telegram overrides for any payment/order/link lifecycle event.
 */
export async function resolveProjectDispatchContext(
  db: AppDb,
  merchant: MerchantRecord,
  projectId: string | null | undefined,
  callbackUrlOverride?: string | null
) {
  const project = await loadProjectById(db, merchant.id, projectId);
  const effective = resolveEffectiveProjectConfig(merchant, project);
  const explicitCallback = callbackUrlOverride?.trim() || undefined;
  const projectWebhook = project?.webhookUrl?.trim() || undefined;
  const targetUrlOverride = explicitCallback || projectWebhook;

  return {
    project,
    effective,
    targetUrlOverride,
    webhookOptions: project
      ? {
          projectId: project.id,
          webhookSecretOverride: effective.webhookSecret,
          allowedOriginsOverride: effective.allowedCallbackOrigins,
        }
      : undefined,
  };
}

/**
 * Checks whether a hardware-reported receiverNumber is allowed for a project's wallet pool.
 * Returns `true` if receiverNumber is absent, project uses COMMON wallets, or receiverNumber
 * matches one of the project's assigned wallets (or does not conflict with another merchant wallet).
 */
export async function isReceiverAllowedForProject(
  db: AppDb,
  merchantId: string,
  projectId: string | null | undefined,
  provider: MfsProvider,
  receiverNumber: string | null | undefined
): Promise<boolean> {
  if (!projectId || !receiverNumber) return true;
  const project = await loadProjectById(db, merchantId, projectId);
  if (!project || project.walletSelectionMode !== 'SPECIFIC') return true;

  const [assignedRows, merchantWalletRows] = await Promise.all([
    db
      .select({ walletNumber: merchantWallets.walletNumber, provider: merchantWallets.provider })
      .from(merchantProjectWallets)
      .innerJoin(merchantWallets, eq(merchantProjectWallets.walletId, merchantWallets.id))
      .where(
        and(
          eq(merchantProjectWallets.projectId, projectId),
          eq(merchantWallets.merchantId, merchantId),
          eq(merchantWallets.isActive, true)
        )
      ),
    db
      .select({ walletNumber: merchantWallets.walletNumber, provider: merchantWallets.provider })
      .from(merchantWallets)
      .where(and(eq(merchantWallets.merchantId, merchantId), eq(merchantWallets.provider, provider))),
  ]);

  if (assignedRows.length === 0) return false;
  const matchesAssigned = assignedRows.some(
    (w) => w.provider === provider && w.walletNumber === receiverNumber
  );
  if (matchesAssigned) return true;

  // Only reject when receiverNumber explicitly matches a DIFFERENT wallet configured under this merchant
  const belongsToOtherMerchantWallet = merchantWalletRows.some(
    (w) => w.walletNumber === receiverNumber
  );
  return !belongsToOtherMerchantWallet;
}

/**
 * Resolves active rotated wallets for a merchant or specific sub-project (`COMMON` vs `SPECIFIC`).
 */
export async function resolveProjectRotatedWallets(
  db: AppDb,
  merchantId: string,
  project?: MerchantProjectRecord | null,
  provider?: MfsProvider,
  env?: Env
): Promise<EnrichedWalletRecord[]> {
  let allowedWalletIds: string[] | undefined;
  if (project && project.walletSelectionMode === 'SPECIFIC') {
    const rows = await db
      .select({ walletId: merchantProjectWallets.walletId })
      .from(merchantProjectWallets)
      .where(eq(merchantProjectWallets.projectId, project.id));
    allowedWalletIds = rows.map((r) => r.walletId);
    if (allowedWalletIds.length === 0) {
      return [];
    }
  }

  if (provider) {
    const specific = await getActiveRotatedWallet(db, merchantId, provider, env, {
      allowedWalletIds,
    });
    if (specific) {
      return [specific];
    }
  }

  return getAllActiveRotatedWallets(db, merchantId, env, { allowedWalletIds });
}

/**
 * Lists all sub-projects for a merchant (filtered to the pinned project when projectAuthScoped).
 */
export async function listMerchantProjects(
  db: AppDb,
  merchantId: string,
  options?: { activeOnly?: boolean; scopedProjectId?: string }
): Promise<SafeProjectView[]> {
  const conds = [eq(merchantProjects.merchantId, merchantId)];
  if (options?.activeOnly) {
    conds.push(eq(merchantProjects.isActive, true));
  }
  if (options?.scopedProjectId) {
    conds.push(eq(merchantProjects.id, options.scopedProjectId));
  }

  const rows = await db
    .select()
    .from(merchantProjects)
    .where(and(...conds))
    .orderBy(desc(merchantProjects.isDefault), asc(merchantProjects.createdAt));

  const walletMap = await getAssignedWalletIdsMap(
    db,
    rows.map((r) => r.id)
  );
  return rows.map((r) => toSafeProjectView(r, walletMap.get(r.id) ?? []));
}

/**
 * Returns a single sub-project view scoped to `merchantId`.
 */
export async function getMerchantProjectById(
  db: AppDb,
  merchantId: string,
  projectId: string
): Promise<SafeProjectView> {
  const rows = await db
    .select()
    .from(merchantProjects)
    .where(and(eq(merchantProjects.id, projectId), eq(merchantProjects.merchantId, merchantId)))
    .limit(1);

  if (!rows[0]) {
    throw new NotFoundError(`Project '${projectId}' not found`);
  }

  const walletMap = await getAssignedWalletIdsMap(db, [projectId]);
  return toSafeProjectView(rows[0], walletMap.get(projectId) ?? []);
}

/**
 * Creates a new sub-project under a merchant (Admin-provisioned).
 */
export async function createMerchantProject(
  db: AppDb,
  merchantId: string,
  input: CreateSubProjectInput,
  env?: Env
) {
  if (input.allowedCallbackOrigins) {
    for (const origin of input.allowedCallbackOrigins) {
      validateSafeWebhookUrl(origin, env);
    }
  }
  const webhookUrl = input.webhookUrl?.trim() || '';
  if (webhookUrl) {
    validateSafeWebhookUrl(webhookUrl, env, input.allowedCallbackOrigins);
  }

  const validWalletIds =
    input.walletSelectionMode === 'SPECIFIC'
      ? await validateMerchantWalletIds(db, merchantId, input.walletIds)
      : await validateMerchantWalletIds(db, merchantId, input.walletIds);

  const slug = await ensureUniqueProjectSlug(db, merchantId, input.slug || input.name);
  const id = `prj_${generateSecureToken(10).toLowerCase()}`;
  const rawApiKey = generateProjectApiKey();
  const apiKeyHash = await hashSha256(rawApiKey);
  const apiKeyPrefix = rawApiKey.slice(0, 12);
  const webhookSecret = generateWebhookSecret();
  const publishableKey = generatePublishableKey();
  const now = new Date();
  const ignoreStorefrontSync =
    input.ignoreStorefrontSync ?? input.accountMode === 'STANDALONE';

  if (input.isDefault) {
    await db
      .update(merchantProjects)
      .set({ isDefault: false, updatedAt: now })
      .where(and(eq(merchantProjects.merchantId, merchantId), eq(merchantProjects.isDefault, true)));
  }

  await db.insert(merchantProjects).values({
    id,
    merchantId,
    name: input.name,
    slug,
    description: input.description ?? null,
    accountMode: input.accountMode,
    verificationMode: input.verificationMode,
    walletSelectionMode: input.walletSelectionMode,
    ignoreStorefrontSync,
    webhookUrl,
    webhookSecret,
    apiKeyHash,
    apiKeyPrefix,
    publishableKey,
    allowedCallbackOriginsJson: JSON.stringify(input.allowedCallbackOrigins ?? []),
    telegramBotToken: input.telegramBotToken?.trim() || null,
    telegramChatId: input.telegramChatId?.trim() || null,
    isDefault: Boolean(input.isDefault),
    isActive: true,
    createdAt: now,
    updatedAt: now,
  });

  if (validWalletIds.length > 0) {
    await db.insert(merchantProjectWallets).values(
      validWalletIds.map((walletId) => ({
        projectId: id,
        walletId,
        createdAt: now,
      }))
    );
  }

  const project = await getMerchantProjectById(db, merchantId, id);
  return {
    project,
    credentials: {
      apiKey: rawApiKey,
      webhookSecret,
      publishableKey,
    },
  };
}

/**
 * Updates a sub-project's configuration and/or wallet assignments.
 */
export async function updateMerchantProject(
  db: AppDb,
  merchantId: string,
  projectId: string,
  input: AdminUpdateSubProjectInput | MerchantUpdateSubProjectInput,
  env?: Env
): Promise<SafeProjectView> {
  const existingRows = await db
    .select()
    .from(merchantProjects)
    .where(and(eq(merchantProjects.id, projectId), eq(merchantProjects.merchantId, merchantId)))
    .limit(1);

  const existing = existingRows[0];
  if (!existing) {
    throw new NotFoundError(`Project '${projectId}' not found`);
  }

  if (input.allowedCallbackOrigins) {
    for (const origin of input.allowedCallbackOrigins) {
      validateSafeWebhookUrl(origin, env);
    }
  }
  const nextOrigins =
    input.allowedCallbackOrigins ?? parseAllowedOrigins(existing.allowedCallbackOriginsJson);

  if (input.webhookUrl !== undefined && input.webhookUrl.trim() !== '') {
    validateSafeWebhookUrl(input.webhookUrl.trim(), env, nextOrigins);
  }

  const now = new Date();
  const adminInput = input as AdminUpdateSubProjectInput;
  const updateData: Partial<typeof merchantProjects.$inferInsert> = {
    updatedAt: now,
  };

  if (input.name !== undefined) updateData.name = input.name;
  if (adminInput.slug !== undefined) {
    updateData.slug = await ensureUniqueProjectSlug(db, merchantId, adminInput.slug, projectId);
  }
  if (input.description !== undefined) updateData.description = input.description;
  if (input.accountMode !== undefined) updateData.accountMode = input.accountMode;
  if (input.verificationMode !== undefined) updateData.verificationMode = input.verificationMode;
  if (input.walletSelectionMode !== undefined) {
    updateData.walletSelectionMode = input.walletSelectionMode;
  }
  if (input.ignoreStorefrontSync !== undefined) {
    updateData.ignoreStorefrontSync = input.ignoreStorefrontSync;
  }
  if (input.webhookUrl !== undefined) updateData.webhookUrl = input.webhookUrl.trim();
  if (input.allowedCallbackOrigins !== undefined) {
    updateData.allowedCallbackOriginsJson = JSON.stringify(input.allowedCallbackOrigins);
  }
  if (input.telegramBotToken !== undefined) {
    updateData.telegramBotToken = input.telegramBotToken?.trim() || null;
  }
  if (input.telegramChatId !== undefined) {
    updateData.telegramChatId = input.telegramChatId?.trim() || null;
  }
  if (adminInput.isActive !== undefined) {
    updateData.isActive = adminInput.isActive;
  }
  if (adminInput.isDefault !== undefined) {
    if (adminInput.isDefault) {
      await db
        .update(merchantProjects)
        .set({ isDefault: false, updatedAt: now })
        .where(
          and(
            eq(merchantProjects.merchantId, merchantId),
            eq(merchantProjects.isDefault, true),
            ne(merchantProjects.id, projectId)
          )
        );
    }
    updateData.isDefault = adminInput.isDefault;
  }

  await db
    .update(merchantProjects)
    .set(updateData)
    .where(and(eq(merchantProjects.id, projectId), eq(merchantProjects.merchantId, merchantId)));

  if (input.walletIds !== undefined) {
    const validWalletIds = await validateMerchantWalletIds(db, merchantId, input.walletIds);
    await db.delete(merchantProjectWallets).where(eq(merchantProjectWallets.projectId, projectId));
    if (validWalletIds.length > 0) {
      await db.insert(merchantProjectWallets).values(
        validWalletIds.map((walletId) => ({
          projectId,
          walletId,
          createdAt: now,
        }))
      );
    }
  }

  return getMerchantProjectById(db, merchantId, projectId);
}

/**
 * Rotates a sub-project's API key, publishable key, and/or webhook secret.
 */
export async function rotateMerchantProjectKeys(
  db: AppDb,
  merchantId: string,
  projectId: string,
  target: 'webhook' | 'api' | 'all' = 'all'
) {
  const existingRows = await db
    .select()
    .from(merchantProjects)
    .where(and(eq(merchantProjects.id, projectId), eq(merchantProjects.merchantId, merchantId)))
    .limit(1);

  if (!existingRows[0]) {
    throw new NotFoundError(`Project '${projectId}' not found`);
  }

  const now = new Date();
  const updates: Partial<typeof merchantProjects.$inferInsert> = { updatedAt: now };
  const result: {
    projectId: string;
    webhookSecret?: string;
    apiKey?: string;
    apiKeyPrefix?: string;
    publishableKey?: string;
  } = { projectId };

  if (target === 'webhook' || target === 'all') {
    const secret = generateWebhookSecret();
    updates.webhookSecret = secret;
    result.webhookSecret = secret;
  }

  if (target === 'api' || target === 'all') {
    const rawApiKey = generateProjectApiKey();
    const apiKeyHash = await hashSha256(rawApiKey);
    const apiKeyPrefix = rawApiKey.slice(0, 12);
    const publishableKey = generatePublishableKey();
    updates.apiKeyHash = apiKeyHash;
    updates.apiKeyPrefix = apiKeyPrefix;
    updates.publishableKey = publishableKey;
    result.apiKey = rawApiKey;
    result.apiKeyPrefix = apiKeyPrefix;
    result.publishableKey = publishableKey;
  }

  await db
    .update(merchantProjects)
    .set(updates)
    .where(and(eq(merchantProjects.id, projectId), eq(merchantProjects.merchantId, merchantId)));

  return result;
}

/**
 * Deletes a sub-project and detaches historical projectId references cleanly without losing ledger records.
 */
export async function deleteMerchantProject(
  db: AppDb,
  merchantId: string,
  projectId: string
) {
  const existingRows = await db
    .select({ id: merchantProjects.id, name: merchantProjects.name })
    .from(merchantProjects)
    .where(and(eq(merchantProjects.id, projectId), eq(merchantProjects.merchantId, merchantId)))
    .limit(1);

  if (!existingRows[0]) {
    throw new NotFoundError(`Project '${projectId}' not found`);
  }

  await db.batch([
    db
      .update(paymentLinks)
      .set({ projectId: null })
      .where(and(eq(paymentLinks.merchantId, merchantId), eq(paymentLinks.projectId, projectId))),
    db
      .update(paymentIntents)
      .set({ projectId: null })
      .where(and(eq(paymentIntents.merchantId, merchantId), eq(paymentIntents.projectId, projectId))),
    db
      .update(checkoutSessions)
      .set({ projectId: null })
      .where(and(eq(checkoutSessions.merchantId, merchantId), eq(checkoutSessions.projectId, projectId))),
    db
      .update(verificationQueue)
      .set({ projectId: null })
      .where(and(eq(verificationQueue.merchantId, merchantId), eq(verificationQueue.projectId, projectId))),
    db
      .update(merchantOrders)
      .set({ projectId: null })
      .where(and(eq(merchantOrders.merchantId, merchantId), eq(merchantOrders.projectId, projectId))),
    db
      .update(webhookDeliveries)
      .set({ projectId: null })
      .where(and(eq(webhookDeliveries.merchantId, merchantId), eq(webhookDeliveries.projectId, projectId))),
    db.delete(merchantProjectWallets).where(eq(merchantProjectWallets.projectId, projectId)),
    db
      .delete(merchantProjects)
      .where(and(eq(merchantProjects.id, projectId), eq(merchantProjects.merchantId, merchantId))),
  ]);

  return { deleted: true, id: projectId, name: existingRows[0].name };
}
