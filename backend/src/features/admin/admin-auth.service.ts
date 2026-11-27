import type { Context } from 'hono';
import { and, desc, eq, isNull, ne, sql } from 'drizzle-orm';
import type { AppDb } from '../../db/client';
import { ensureRuntimeSchema } from '../../db/bootstrap';
import {
  adminAuditLogs,
  adminSessions,
  adminUsers,
  type AdminAuthMethod,
  type AdminRole,
  type AdminSessionRecord,
  type AdminUserRecord,
} from '../../db/schema';
import {
  generateSecureToken,
  hashPassword,
  signJwt,
  timingSafeEqual,
  verifyPassword,
} from '../../shared/crypto';
import {
  AppError,
  ConflictError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from '../../shared/errors';
import {
  resolveJwtSecret,
  resolveMasterAdminKey,
  type OrbitAdminJwtClaims,
} from '../../shared/middleware';
import type { AppContextEnv, Env } from '../../shared/types';
import type {
  BootstrapAdminDTO,
  CreateAdminUserDTO,
  UpdateAdminUserDTO,
} from './admin.schema';

const ADMIN_SESSION_TTL_SECONDS = 24 * 60 * 60; // 24h
const PASSWORD_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$';

export interface AdminRequestMeta {
  ipAddress?: string | null;
  userAgent?: string | null;
}

export interface AdminActor {
  id?: string | null;
  email?: string | null;
  sessionId?: string | null;
  ipAddress?: string | null;
}

export interface SafeAdminUserView {
  id: string;
  email: string;
  fullName: string;
  role: AdminRole;
  isActive: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface SafeAdminSessionView {
  id: string;
  adminUserId: string | null;
  adminEmail: string | null;
  authMethod: AdminAuthMethod;
  role: AdminRole;
  ipAddress: string | null;
  userAgent: string | null;
  lastSeenAt: Date | null;
  expiresAt: Date;
  revokedAt: Date | null;
  createdAt: Date;
}

function generateTempPassword(length = 12): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = '';
  for (let i = 0; i < length; i++) {
    out += PASSWORD_ALPHABET[bytes[i] % PASSWORD_ALPHABET.length];
  }
  return out;
}

function toSafeAdminUser(u: AdminUserRecord): SafeAdminUserView {
  return {
    id: u.id,
    email: u.email,
    fullName: u.fullName,
    role: u.role,
    isActive: u.isActive,
    lastLoginAt: u.lastLoginAt,
    createdAt: u.createdAt,
    updatedAt: u.updatedAt,
  };
}

function toSafeAdminSession(s: AdminSessionRecord): SafeAdminSessionView {
  return {
    id: s.id,
    adminUserId: s.adminUserId,
    adminEmail: s.adminEmail,
    authMethod: s.authMethod,
    role: s.role,
    ipAddress: s.ipAddress,
    userAgent: s.userAgent,
    lastSeenAt: s.lastSeenAt,
    expiresAt: s.expiresAt,
    revokedAt: s.revokedAt,
    createdAt: s.createdAt,
  };
}

export function extractAdminRequestMeta(c: Context<AppContextEnv>): AdminRequestMeta {
  const cfIp = c.req.header('cf-connecting-ip')?.trim();
  const xff = c.req.header('x-forwarded-for')?.split(',')[0]?.trim();
  const userAgent = c.req.header('user-agent')?.trim();

  return {
    ipAddress: cfIp || xff || null,
    userAgent: userAgent ? userAgent.slice(0, 512) : null,
  };
}

export function extractAdminActor(c: Context<AppContextEnv>): AdminActor {
  const meta = extractAdminRequestMeta(c);
  return {
    id: c.get('adminUserId') || null,
    email: c.get('adminEmail') || null,
    sessionId: c.get('adminSessionId') || null,
    ipAddress: meta.ipAddress,
  };
}

async function hasAnyAdminUsers(db: AppDb): Promise<boolean> {
  const countRows = await db
    .select({ count: sql<number>`count(*)` })
    .from(adminUsers);
  return (Number(countRows[0]?.count) || 0) > 0;
}

export async function recordAdminAudit(
  db: AppDb,
  entry: {
    actor?: AdminActor;
    action: string;
    targetType?: string;
    targetId?: string;
    metadata?: Record<string, unknown>;
  }
): Promise<void> {
  await ensureRuntimeSchema(db);
  await db.insert(adminAuditLogs).values({
    id: `aud_${generateSecureToken(12)}`,
    adminUserId: entry.actor?.id || null,
    adminEmail: entry.actor?.email || null,
    sessionId: entry.actor?.sessionId || null,
    action: entry.action,
    targetType: entry.targetType || null,
    targetId: entry.targetId || null,
    metadataJson: entry.metadata ? JSON.stringify(entry.metadata) : null,
    ipAddress: entry.actor?.ipAddress || null,
    createdAt: new Date(),
  });
}

/**
 * Authenticates an Admin account via email + PBKDF2 password, creates a 24h
 * `admin_sessions` row, signs an `ORBIT_ADMIN_JWT`, and records an audit event.
 */
export async function loginAdminWithPassword(
  db: AppDb,
  env: Env,
  email: string,
  password: string,
  meta: AdminRequestMeta
) {
  await ensureRuntimeSchema(db);

  const normalizedEmail = email.trim().toLowerCase();
  const userRes = await db
    .select()
    .from(adminUsers)
    .where(sql`lower(${adminUsers.email}) = ${normalizedEmail}`)
    .limit(1);

  const user = userRes[0];
  if (!user || !user.isActive) {
    throw new UnauthorizedError('Invalid admin email or password');
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    throw new UnauthorizedError('Invalid admin email or password');
  }

  const now = new Date();
  const iat = Math.floor(now.getTime() / 1000);
  const exp = iat + ADMIN_SESSION_TTL_SECONDS;
  const expiresAt = new Date(exp * 1000);
  const sessionId = `ases_${generateSecureToken(16)}`;

  const newSession: AdminSessionRecord = {
    id: sessionId,
    adminUserId: user.id,
    adminEmail: user.email,
    authMethod: 'PASSWORD',
    role: user.role,
    ipAddress: meta.ipAddress || null,
    userAgent: meta.userAgent || null,
    lastSeenAt: now,
    expiresAt,
    revokedAt: null,
    createdAt: now,
  };

  await db.insert(adminSessions).values(newSession);
  await db
    .update(adminUsers)
    .set({ lastLoginAt: now, updatedAt: now })
    .where(eq(adminUsers.id, user.id));

  const claims: OrbitAdminJwtClaims = {
    typ: 'ORBIT_ADMIN_JWT',
    sub: user.id,
    email: user.email,
    role: user.role,
    sid: sessionId,
    authMethod: 'PASSWORD',
    iat,
    exp,
  };

  const accessToken = await signJwt(claims, resolveJwtSecret(env));

  await recordAdminAudit(db, {
    actor: {
      id: user.id,
      email: user.email,
      sessionId,
      ipAddress: meta.ipAddress,
    },
    action: 'ADMIN_LOGIN_PASSWORD',
    targetType: 'admin_session',
    targetId: sessionId,
    metadata: { role: user.role },
  });

  return {
    accessToken,
    session: toSafeAdminSession(newSession),
    admin: {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      authMethod: 'PASSWORD' as const,
      isActive: user.isActive,
      lastLoginAt: now,
    },
    hasAdminUsers: true,
  };
}

/**
 * Authenticates via Master Admin Key, issues a tracked 24h `admin_sessions` row
 * (`authMethod: 'MASTER_KEY'`), signs an `ORBIT_ADMIN_JWT`, and logs an audit event.
 */
export async function loginAdminWithMasterKey(
  db: AppDb,
  env: Env,
  adminKey: string,
  meta: AdminRequestMeta
) {
  await ensureRuntimeSchema(db);

  const expectedKey = resolveMasterAdminKey(env);
  if (!expectedKey) {
    throw new AppError(
      'MASTER_ADMIN_KEY is not configured on this environment',
      500,
      'ADMIN_NOT_CONFIGURED'
    );
  }

  if (!adminKey || !timingSafeEqual(adminKey.trim(), expectedKey)) {
    throw new UnauthorizedError('Incorrect Master Admin Key');
  }

  const now = new Date();
  const iat = Math.floor(now.getTime() / 1000);
  const exp = iat + ADMIN_SESSION_TTL_SECONDS;
  const expiresAt = new Date(exp * 1000);
  const sessionId = `ases_${generateSecureToken(16)}`;
  const adminEmail = 'master-key@orbit.internal';

  const newSession: AdminSessionRecord = {
    id: sessionId,
    adminUserId: null,
    adminEmail,
    authMethod: 'MASTER_KEY',
    role: 'SUPER_ADMIN',
    ipAddress: meta.ipAddress || null,
    userAgent: meta.userAgent || null,
    lastSeenAt: now,
    expiresAt,
    revokedAt: null,
    createdAt: now,
  };

  await db.insert(adminSessions).values(newSession);

  const claims: OrbitAdminJwtClaims = {
    typ: 'ORBIT_ADMIN_JWT',
    sub: 'master_admin',
    email: adminEmail,
    role: 'SUPER_ADMIN',
    sid: sessionId,
    authMethod: 'MASTER_KEY',
    iat,
    exp,
  };

  const accessToken = await signJwt(claims, resolveJwtSecret(env));
  const hasAdminUsers = await hasAnyAdminUsers(db);

  await recordAdminAudit(db, {
    actor: {
      id: 'master_admin',
      email: adminEmail,
      sessionId,
      ipAddress: meta.ipAddress,
    },
    action: 'ADMIN_LOGIN_MASTER_KEY',
    targetType: 'admin_session',
    targetId: sessionId,
  });

  return {
    accessToken,
    session: toSafeAdminSession(newSession),
    admin: {
      id: 'master_admin',
      email: adminEmail,
      fullName: 'Master Key Admin',
      role: 'SUPER_ADMIN' as const,
      authMethod: 'MASTER_KEY' as const,
    },
    hasAdminUsers,
  };
}

/**
 * Resolves the currently authenticated admin identity, session, and bootstrap state.
 */
export async function getAdminAuthContext(db: AppDb, c: Context<AppContextEnv>) {
  await ensureRuntimeSchema(db);

  const adminUserId = c.get('adminUserId') || 'master_admin';
  const adminSessionId = c.get('adminSessionId');
  const adminRole = (c.get('adminRole') as AdminRole | undefined) || 'SUPER_ADMIN';
  const adminEmail = c.get('adminEmail') || 'master-key@orbit.internal';
  const contextAuthMethod = c.get('adminAuthMethod');

  const [userRes, sessionRes, hasAdminUsers] = await Promise.all([
    adminUserId !== 'master_admin'
      ? db.select().from(adminUsers).where(eq(adminUsers.id, adminUserId)).limit(1)
      : Promise.resolve([] as AdminUserRecord[]),
    adminSessionId
      ? db.select().from(adminSessions).where(eq(adminSessions.id, adminSessionId)).limit(1)
      : Promise.resolve([] as AdminSessionRecord[]),
    hasAnyAdminUsers(db),
  ]);

  const user = userRes[0];
  const session = sessionRes[0];

  const resolvedAuthMethod: AdminAuthMethod =
    session?.authMethod ||
    (contextAuthMethod === 'master_key' || adminUserId === 'master_admin'
      ? 'MASTER_KEY'
      : 'PASSWORD');

  return {
    admin: {
      id: user?.id || adminUserId,
      email: user?.email || adminEmail,
      fullName:
        user?.fullName ||
        (adminUserId === 'master_admin' ? 'Master Key Admin' : adminEmail),
      role: user?.role || adminRole,
      authMethod: resolvedAuthMethod,
    },
    session: session ? toSafeAdminSession(session) : null,
    hasAdminUsers,
  };
}

/**
 * Creates the very first SUPER_ADMIN account when no admin_users exist yet.
 */
export async function bootstrapFirstAdmin(
  db: AppDb,
  _env: Env,
  input: BootstrapAdminDTO,
  meta: AdminRequestMeta & { actor?: AdminActor }
) {
  await ensureRuntimeSchema(db);

  if (await hasAnyAdminUsers(db)) {
    throw new ConflictError(
      'Admin accounts have already been bootstrapped. Use standard admin user management.'
    );
  }

  const normalizedEmail = input.email.trim().toLowerCase();
  const passwordHash = await hashPassword(input.password);
  const now = new Date();
  const id = `adm_${generateSecureToken(12)}`;

  const created: AdminUserRecord = {
    id,
    email: normalizedEmail,
    fullName: input.fullName.trim(),
    passwordHash,
    role: 'SUPER_ADMIN',
    isActive: true,
    lastLoginAt: null,
    createdAt: now,
    updatedAt: now,
  };

  await db.insert(adminUsers).values(created);

  await recordAdminAudit(db, {
    actor: meta.actor || {
      id: 'master_admin',
      email: 'master-key@orbit.internal',
      ipAddress: meta.ipAddress,
    },
    action: 'ADMIN_BOOTSTRAP',
    targetType: 'admin_user',
    targetId: id,
    metadata: { email: normalizedEmail, role: 'SUPER_ADMIN' },
  });

  return toSafeAdminUser(created);
}

/**
 * Revokes a single admin session on logout and writes an audit record.
 */
export async function logoutAdminSession(
  db: AppDb,
  sessionId: string | undefined,
  actor: AdminActor
) {
  await ensureRuntimeSchema(db);
  const now = new Date();

  if (sessionId) {
    await db
      .update(adminSessions)
      .set({ revokedAt: now })
      .where(and(eq(adminSessions.id, sessionId), isNull(adminSessions.revokedAt)));

    await recordAdminAudit(db, {
      actor,
      action: 'ADMIN_LOGOUT',
      targetType: 'admin_session',
      targetId: sessionId,
    });
  }

  return { loggedOut: true };
}

/**
 * Revokes all active admin sessions (optionally keeping the caller's current session).
 */
export async function logoutAllAdminSessions(
  db: AppDb,
  exceptSessionId: string | undefined,
  actor: AdminActor
) {
  await ensureRuntimeSchema(db);
  const now = new Date();

  const whereClause = exceptSessionId
    ? and(isNull(adminSessions.revokedAt), ne(adminSessions.id, exceptSessionId))
    : isNull(adminSessions.revokedAt);

  const revokedRows = await db
    .update(adminSessions)
    .set({ revokedAt: now })
    .where(whereClause)
    .returning({ id: adminSessions.id });

  await recordAdminAudit(db, {
    actor,
    action: 'ADMIN_LOGOUT_ALL',
    targetType: 'admin_session',
    targetId: exceptSessionId || 'ALL',
    metadata: {
      revokedCount: revokedRows.length,
      keptCurrentSession: Boolean(exceptSessionId),
    },
  });

  return {
    revokedCount: revokedRows.length,
    keptCurrentSession: Boolean(exceptSessionId),
  };
}

/**
 * Returns admin sessions (latest 50), safe admin user accounts, and audit logs (latest 50).
 */
export async function listAdminSecurityState(db: AppDb) {
  await ensureRuntimeSchema(db);

  const [sessions, users, auditLogs] = await Promise.all([
    db
      .select()
      .from(adminSessions)
      .orderBy(desc(adminSessions.createdAt))
      .limit(50),
    db
      .select()
      .from(adminUsers)
      .orderBy(desc(adminUsers.createdAt)),
    db
      .select()
      .from(adminAuditLogs)
      .orderBy(desc(adminAuditLogs.createdAt))
      .limit(50),
  ]);

  return {
    sessions: sessions.map(toSafeAdminSession),
    users: users.map(toSafeAdminUser),
    auditLogs,
    hasAdminUsers: users.length > 0,
  };
}

/**
 * Revokes a specific admin session by ID.
 */
export async function revokeSpecificAdminSession(
  db: AppDb,
  sessionId: string,
  actor: AdminActor
) {
  await ensureRuntimeSchema(db);

  const existing = await db
    .select({ id: adminSessions.id })
    .from(adminSessions)
    .where(eq(adminSessions.id, sessionId))
    .limit(1);

  if (!existing[0]) {
    throw new NotFoundError(`Admin session '${sessionId}' not found`);
  }

  const now = new Date();
  await db
    .update(adminSessions)
    .set({ revokedAt: now })
    .where(and(eq(adminSessions.id, sessionId), isNull(adminSessions.revokedAt)));

  await recordAdminAudit(db, {
    actor,
    action: 'ADMIN_SESSION_REVOKED',
    targetType: 'admin_session',
    targetId: sessionId,
  });

  return {
    sessionId,
    revokedAt: now.toISOString(),
  };
}

/**
 * Creates a new Hub Admin account (SUPER_ADMIN or ADMIN_OPERATOR).
 */
export async function createAdminUser(
  db: AppDb,
  input: CreateAdminUserDTO,
  actor: AdminActor
) {
  await ensureRuntimeSchema(db);

  const normalizedEmail = input.email.trim().toLowerCase();
  const existing = await db
    .select({ id: adminUsers.id })
    .from(adminUsers)
    .where(sql`lower(${adminUsers.email}) = ${normalizedEmail}`)
    .limit(1);

  if (existing[0]) {
    throw new ConflictError(`An admin user with email '${normalizedEmail}' already exists`);
  }

  const wasGenerated = !input.password;
  const rawPassword = input.password || generateTempPassword(12);
  const passwordHash = await hashPassword(rawPassword);
  const now = new Date();
  const id = `adm_${generateSecureToken(12)}`;

  const created: AdminUserRecord = {
    id,
    email: normalizedEmail,
    fullName: input.fullName.trim(),
    passwordHash,
    role: input.role,
    isActive: true,
    lastLoginAt: null,
    createdAt: now,
    updatedAt: now,
  };

  await db.insert(adminUsers).values(created);

  await recordAdminAudit(db, {
    actor,
    action: 'ADMIN_USER_CREATED',
    targetType: 'admin_user',
    targetId: id,
    metadata: { email: normalizedEmail, role: input.role },
  });

  return {
    ...toSafeAdminUser(created),
    ...(wasGenerated ? { temporaryPassword: rawPassword } : {}),
  };
}

/**
 * Updates an admin user's profile, role, active state, or resets their password.
 * Automatically revokes all active sessions when deactivated or password-reset.
 */
export async function updateAdminUser(
  db: AppDb,
  id: string,
  input: UpdateAdminUserDTO,
  actor: AdminActor
) {
  await ensureRuntimeSchema(db);

  const existingRes = await db
    .select()
    .from(adminUsers)
    .where(eq(adminUsers.id, id))
    .limit(1);

  const existing = existingRes[0];
  if (!existing) {
    throw new NotFoundError(`Admin user '${id}' not found`);
  }

  if (actor.id === id && input.isActive === false) {
    throw new ValidationError('You cannot deactivate your own active admin account');
  }

  const now = new Date();
  const patch: Partial<AdminUserRecord> = {
    updatedAt: now,
  };

  if (input.fullName !== undefined) patch.fullName = input.fullName.trim();
  if (input.role !== undefined) patch.role = input.role;
  if (input.isActive !== undefined) patch.isActive = input.isActive;

  let generatedPassword: string | undefined;
  let passwordWasReset = false;

  if (input.resetPassword === true) {
    generatedPassword = generateTempPassword(12);
    patch.passwordHash = await hashPassword(generatedPassword);
    passwordWasReset = true;
  } else if (typeof input.resetPassword === 'string') {
    patch.passwordHash = await hashPassword(input.resetPassword);
    passwordWasReset = true;
  }

  await db.update(adminUsers).set(patch).where(eq(adminUsers.id, id));

  const shouldRevokeSessions = input.isActive === false || passwordWasReset;
  if (shouldRevokeSessions) {
    await db
      .update(adminSessions)
      .set({ revokedAt: now })
      .where(and(eq(adminSessions.adminUserId, id), isNull(adminSessions.revokedAt)));
  }

  const updatedRes = await db
    .select()
    .from(adminUsers)
    .where(eq(adminUsers.id, id))
    .limit(1);

  const updated = updatedRes[0] || existing;

  await recordAdminAudit(db, {
    actor,
    action: 'ADMIN_USER_UPDATED',
    targetType: 'admin_user',
    targetId: id,
    metadata: {
      email: updated.email,
      role: updated.role,
      isActive: updated.isActive,
      passwordReset: passwordWasReset,
      sessionsRevoked: shouldRevokeSessions,
    },
  });

  return {
    user: toSafeAdminUser(updated),
    ...(generatedPassword ? { temporaryPassword: generatedPassword } : {}),
    sessionsRevoked: shouldRevokeSessions,
  };
}
