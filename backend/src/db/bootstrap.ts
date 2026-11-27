import { sql } from 'drizzle-orm';
import type { AppDb } from './client';

const RUNTIME_SCHEMA_STATEMENTS: readonly string[] = [
  // 0004_app_releases
  `CREATE TABLE IF NOT EXISTS \`app_releases\` (
    \`id\` text PRIMARY KEY NOT NULL,
    \`platform\` text DEFAULT 'ANDROID' NOT NULL,
    \`version_code\` integer NOT NULL,
    \`version_name\` text NOT NULL,
    \`min_supported_version_code\` integer DEFAULT 1 NOT NULL,
    \`mandatory\` integer DEFAULT 0 NOT NULL,
    \`release_notes\` text DEFAULT '' NOT NULL,
    \`file_name\` text NOT NULL,
    \`r2_key\` text NOT NULL,
    \`sha256\` text NOT NULL,
    \`size_bytes\` integer NOT NULL,
    \`is_active\` integer DEFAULT 1 NOT NULL,
    \`created_at\` integer NOT NULL
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS \`unique_app_release_version\` ON \`app_releases\` (\`platform\`,\`version_code\`)`,
  `CREATE INDEX IF NOT EXISTS \`idx_app_releases_latest\` ON \`app_releases\` (\`platform\`,\`is_active\`,\`version_code\`)`,

  // 0006_admin_auth_sessions
  `CREATE TABLE IF NOT EXISTS \`admin_users\` (
    \`id\` text PRIMARY KEY NOT NULL,
    \`email\` text NOT NULL,
    \`full_name\` text NOT NULL,
    \`password_hash\` text NOT NULL,
    \`role\` text DEFAULT 'ADMIN_OPERATOR' NOT NULL,
    \`is_active\` integer DEFAULT 1 NOT NULL,
    \`last_login_at\` integer,
    \`created_at\` integer NOT NULL,
    \`updated_at\` integer NOT NULL
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS \`unique_admin_user_email\` ON \`admin_users\` (\`email\`)`,
  `CREATE TABLE IF NOT EXISTS \`admin_sessions\` (
    \`id\` text PRIMARY KEY NOT NULL,
    \`admin_user_id\` text,
    \`admin_email\` text,
    \`auth_method\` text NOT NULL,
    \`role\` text NOT NULL,
    \`ip_address\` text,
    \`user_agent\` text,
    \`last_seen_at\` integer,
    \`expires_at\` integer NOT NULL,
    \`revoked_at\` integer,
    \`created_at\` integer NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS \`idx_admin_sessions_active\` ON \`admin_sessions\` (\`revoked_at\`,\`expires_at\`)`,
  `CREATE INDEX IF NOT EXISTS \`idx_admin_sessions_user\` ON \`admin_sessions\` (\`admin_user_id\`)`,
  `CREATE TABLE IF NOT EXISTS \`admin_audit_logs\` (
    \`id\` text PRIMARY KEY NOT NULL,
    \`admin_user_id\` text,
    \`admin_email\` text,
    \`session_id\` text,
    \`action\` text NOT NULL,
    \`target_type\` text,
    \`target_id\` text,
    \`metadata_json\` text,
    \`ip_address\` text,
    \`created_at\` integer NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS \`idx_admin_audit_created\` ON \`admin_audit_logs\` (\`created_at\`)`,
  `CREATE INDEX IF NOT EXISTS \`idx_admin_audit_action\` ON \`admin_audit_logs\` (\`action\`)`,
];

const CORE_HEALTH_TABLES = [
  'merchants',
  'app_releases',
  'payment_intents',
  'admin_users',
  'admin_sessions',
  'admin_audit_logs',
] as const;

let schemaReadyPromise: Promise<void> | null = null;

/**
 * Idempotently ensures runtime-critical D1 tables (`app_releases`, `admin_users`,
 * `admin_sessions`, `admin_audit_logs`) exist even if remote migrations lag behind.
 */
export function ensureRuntimeSchema(db: AppDb): Promise<void> {
  if (!schemaReadyPromise) {
    schemaReadyPromise = (async () => {
      for (const stmt of RUNTIME_SCHEMA_STATEMENTS) {
        await db.run(sql.raw(stmt));
      }
    })().catch((err) => {
      schemaReadyPromise = null;
      throw err;
    });
  }
  return schemaReadyPromise;
}

/**
 * Probes core tables with lightweight SELECT 1 queries to report D1 schema readiness.
 */
export async function checkCoreTablesHealth(
  db: AppDb
): Promise<Record<string, boolean>> {
  const results: Record<string, boolean> = {};
  await Promise.all(
    CORE_HEALTH_TABLES.map(async (table) => {
      try {
        await db.run(sql.raw(`SELECT 1 FROM \`${table}\` LIMIT 1`));
        results[table] = true;
      } catch {
        results[table] = false;
      }
    })
  );
  return results;
}
