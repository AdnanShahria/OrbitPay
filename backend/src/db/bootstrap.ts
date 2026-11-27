import { sql } from 'drizzle-orm';
import type { AppDb } from './client';

const CORE_TABLE_STATEMENTS: readonly string[] = [
  // 0001_router_tables
  `CREATE TABLE IF NOT EXISTS \`media_assets\` (
    \`id\` text PRIMARY KEY NOT NULL,
    \`merchant_id\` text,
    \`file_name\` text NOT NULL,
    \`mime_type\` text NOT NULL,
    \`size_bytes\` integer NOT NULL,
    \`sha256\` text NOT NULL,
    \`primary_provider\` text NOT NULL,
    \`storage_key\` text NOT NULL,
    \`public_url\` text,
    \`fallback_locations_json\` text,
    \`data_base64\` text,
    \`created_at\` integer NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS \`idx_media_merchant\` ON \`media_assets\` (\`merchant_id\`,\`created_at\`)`,
  `CREATE TABLE IF NOT EXISTS \`router_kv_store\` (
    \`key\` text PRIMARY KEY NOT NULL,
    \`value_json\` text NOT NULL,
    \`expires_at\` integer,
    \`updated_at\` integer NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS \`router_provider_logs\` (
    \`id\` text PRIMARY KEY NOT NULL,
    \`channel\` text NOT NULL,
    \`selected_provider\` text,
    \`status\` text NOT NULL,
    \`fallback_triggered\` integer DEFAULT 0 NOT NULL,
    \`attempts_json\` text NOT NULL,
    \`latency_ms\` integer NOT NULL,
    \`caller_id\` text,
    \`created_at\` integer NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS \`idx_router_logs_channel\` ON \`router_provider_logs\` (\`channel\`,\`created_at\`)`,

  // 0002_auth_unique_orders
  `CREATE TABLE IF NOT EXISTS \`checkout_sessions\` (
    \`id\` text PRIMARY KEY NOT NULL,
    \`merchant_id\` text NOT NULL,
    \`external_order_id\` text NOT NULL,
    \`customer_email\` text NOT NULL,
    \`base_amount\` real NOT NULL,
    \`unique_amount\` real NOT NULL,
    \`offset_cents\` integer NOT NULL,
    \`provider\` text,
    \`status\` text DEFAULT 'OPEN' NOT NULL,
    \`expires_at\` integer NOT NULL,
    \`created_at\` integer NOT NULL,
    FOREIGN KEY (\`merchant_id\`) REFERENCES \`merchants\`(\`id\`) ON UPDATE no action ON DELETE no action
  )`,
  `CREATE INDEX IF NOT EXISTS \`idx_checkout_active\` ON \`checkout_sessions\` (\`merchant_id\`,\`base_amount\`,\`status\`,\`expires_at\`)`,
  `CREATE INDEX IF NOT EXISTS \`idx_checkout_order\` ON \`checkout_sessions\` (\`merchant_id\`,\`external_order_id\`)`,
  `CREATE TABLE IF NOT EXISTS \`merchant_users\` (
    \`id\` text PRIMARY KEY NOT NULL,
    \`merchant_id\` text NOT NULL,
    \`email\` text NOT NULL,
    \`full_name\` text NOT NULL,
    \`password_hash\` text NOT NULL,
    \`role\` text DEFAULT 'MERCHANT_OWNER' NOT NULL,
    \`is_active\` integer DEFAULT 1 NOT NULL,
    \`last_login_at\` integer,
    \`created_at\` integer NOT NULL,
    \`updated_at\` integer NOT NULL,
    FOREIGN KEY (\`merchant_id\`) REFERENCES \`merchants\`(\`id\`) ON UPDATE no action ON DELETE no action
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS \`unique_merchant_user_email\` ON \`merchant_users\` (\`email\`)`,
  `CREATE INDEX IF NOT EXISTS \`idx_merchant_users_merchant\` ON \`merchant_users\` (\`merchant_id\`)`,
  `CREATE TABLE IF NOT EXISTS \`auth_sessions\` (
    \`id\` text PRIMARY KEY NOT NULL,
    \`user_id\` text NOT NULL,
    \`merchant_id\` text NOT NULL,
    \`device_type\` text NOT NULL,
    \`device_name\` text,
    \`ip_address\` text,
    \`expires_at\` integer NOT NULL,
    \`revoked_at\` integer,
    \`created_at\` integer NOT NULL,
    FOREIGN KEY (\`user_id\`) REFERENCES \`merchant_users\`(\`id\`) ON UPDATE no action ON DELETE no action,
    FOREIGN KEY (\`merchant_id\`) REFERENCES \`merchants\`(\`id\`) ON UPDATE no action ON DELETE no action
  )`,
  `CREATE INDEX IF NOT EXISTS \`idx_auth_sessions_user\` ON \`auth_sessions\` (\`user_id\`)`,
  `CREATE INDEX IF NOT EXISTS \`idx_auth_sessions_merchant\` ON \`auth_sessions\` (\`merchant_id\`,\`revoked_at\`)`,
  `CREATE TABLE IF NOT EXISTS \`merchant_devices\` (
    \`id\` text PRIMARY KEY NOT NULL,
    \`merchant_id\` text NOT NULL,
    \`user_id\` text,
    \`device_name\` text NOT NULL,
    \`device_key_hash\` text NOT NULL,
    \`fcm_token\` text,
    \`last_seen_at\` integer,
    \`is_active\` integer DEFAULT 1 NOT NULL,
    \`created_at\` integer NOT NULL,
    FOREIGN KEY (\`merchant_id\`) REFERENCES \`merchants\`(\`id\`) ON UPDATE no action ON DELETE no action,
    FOREIGN KEY (\`user_id\`) REFERENCES \`merchant_users\`(\`id\`) ON UPDATE no action ON DELETE no action
  )`,
  `CREATE INDEX IF NOT EXISTS \`idx_merchant_devices_key\` ON \`merchant_devices\` (\`device_key_hash\`)`,
  `CREATE INDEX IF NOT EXISTS \`idx_merchant_devices_merchant\` ON \`merchant_devices\` (\`merchant_id\`,\`is_active\`)`,
  `CREATE TABLE IF NOT EXISTS \`merchant_orders\` (
    \`id\` text PRIMARY KEY NOT NULL,
    \`merchant_id\` text NOT NULL,
    \`external_order_id\` text NOT NULL,
    \`customer_name\` text,
    \`customer_phone\` text,
    \`customer_email\` text,
    \`shipping_address\` text,
    \`items_summary\` text,
    \`payment_method\` text DEFAULT 'ORBIT_MFS' NOT NULL,
    \`payment_status\` text DEFAULT 'UNPAID' NOT NULL,
    \`order_status\` text DEFAULT 'NEW' NOT NULL,
    \`base_amount\` real NOT NULL,
    \`unique_amount\` real,
    \`paid_amount\` real,
    \`trx_id\` text,
    \`match_type\` text,
    \`store_callback_url\` text,
    \`metadata_json\` text,
    \`created_at\` integer NOT NULL,
    \`updated_at\` integer NOT NULL,
    FOREIGN KEY (\`merchant_id\`) REFERENCES \`merchants\`(\`id\`) ON UPDATE no action ON DELETE no action
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS \`unique_merchant_order\` ON \`merchant_orders\` (\`merchant_id\`,\`external_order_id\`)`,
  `CREATE INDEX IF NOT EXISTS \`idx_merchant_orders_status\` ON \`merchant_orders\` (\`merchant_id\`,\`order_status\`,\`created_at\`)`,

  // 0003_sms_trust_otp
  `CREATE TABLE IF NOT EXISTS \`otp_codes\` (
    \`id\` text PRIMARY KEY NOT NULL,
    \`merchant_id\` text,
    \`purpose\` text NOT NULL,
    \`phone\` text NOT NULL,
    \`code_hash\` text NOT NULL,
    \`attempts\` integer DEFAULT 0 NOT NULL,
    \`provider\` text,
    \`expires_at\` integer NOT NULL,
    \`consumed_at\` integer,
    \`created_at\` integer NOT NULL,
    FOREIGN KEY (\`merchant_id\`) REFERENCES \`merchants\`(\`id\`) ON UPDATE no action ON DELETE no action
  )`,
  `CREATE INDEX IF NOT EXISTS \`idx_otp_phone\` ON \`otp_codes\` (\`phone\`,\`purpose\`,\`created_at\`)`,

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

  // 0005_universal_payment_v2 tables
  `CREATE TABLE IF NOT EXISTS \`payment_intents\` (
    \`id\` text PRIMARY KEY NOT NULL,
    \`merchant_id\` text NOT NULL,
    \`vertical\` text DEFAULT 'ecommerce' NOT NULL,
    \`external_ref_id\` text NOT NULL,
    \`verification_mode\` text DEFAULT 'AUTO' NOT NULL,
    \`status\` text DEFAULT 'OPEN' NOT NULL,
    \`base_amount\` real NOT NULL,
    \`unique_amount\` real NOT NULL,
    \`paid_amount\` real,
    \`provider\` text,
    \`trx_id\` text,
    \`sender_number\` text,
    \`receipt_asset_id\` text,
    \`receipt_url\` text,
    \`match_type\` text,
    \`trust_flag\` text,
    \`device_online_at_submit\` integer,
    \`sms_ledger_id\` text,
    \`sms_reconciliation_state\` text,
    \`escalation_reason\` text,
    \`resolution_source\` text,
    \`resolved_by_json\` text,
    \`rejection_reason\` text,
    \`callback_url\` text,
    \`return_url\` text,
    \`cancel_url\` text,
    \`customer_json\` text,
    \`display_json\` text,
    \`actions_json\` text,
    \`metadata_json\` text,
    \`state_version\` integer DEFAULT 1 NOT NULL,
    \`submit_attempts\` integer DEFAULT 0 NOT NULL,
    \`grace_expires_at\` integer,
    \`expires_at\` integer NOT NULL,
    \`verified_at\` integer,
    \`resolved_at\` integer,
    \`created_at\` integer NOT NULL,
    \`updated_at\` integer NOT NULL,
    FOREIGN KEY (\`merchant_id\`) REFERENCES \`merchants\`(\`id\`) ON UPDATE no action ON DELETE no action
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS \`uq_payment_intent_merchant_ref\` ON \`payment_intents\` (\`merchant_id\`,\`external_ref_id\`)`,
  `CREATE INDEX IF NOT EXISTS \`idx_payment_intents_status\` ON \`payment_intents\` (\`merchant_id\`,\`status\`,\`created_at\`)`,
  `CREATE INDEX IF NOT EXISTS \`idx_payment_intents_trx\` ON \`payment_intents\` (\`merchant_id\`,\`trx_id\`)`,
  `CREATE INDEX IF NOT EXISTS \`idx_payment_intents_grace\` ON \`payment_intents\` (\`status\`,\`grace_expires_at\`)`,

  `CREATE TABLE IF NOT EXISTS \`payment_links\` (
    \`id\` text PRIMARY KEY NOT NULL,
    \`merchant_id\` text NOT NULL,
    \`slug\` text NOT NULL,
    \`title\` text NOT NULL,
    \`description\` text,
    \`vertical\` text DEFAULT 'custom' NOT NULL,
    \`amount_type\` text DEFAULT 'FIXED' NOT NULL,
    \`fixed_amount\` real,
    \`min_amount\` real,
    \`max_amount\` real,
    \`currency\` text DEFAULT 'BDT' NOT NULL,
    \`verification_mode\` text,
    \`display_json\` text,
    \`actions_json\` text,
    \`metadata_json\` text,
    \`return_url\` text,
    \`cancel_url\` text,
    \`is_active\` integer DEFAULT 1 NOT NULL,
    \`max_uses\` integer,
    \`used_count\` integer DEFAULT 0 NOT NULL,
    \`expires_at\` integer,
    \`created_at\` integer NOT NULL,
    \`updated_at\` integer NOT NULL,
    FOREIGN KEY (\`merchant_id\`) REFERENCES \`merchants\`(\`id\`) ON UPDATE no action ON DELETE no action
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS \`uq_payment_links_slug\` ON \`payment_links\` (\`slug\`)`,
  `CREATE INDEX IF NOT EXISTS \`idx_payment_links_merchant\` ON \`payment_links\` (\`merchant_id\`,\`is_active\`)`,

  `CREATE TABLE IF NOT EXISTS \`consumed_trx_ids\` (
    \`merchant_id\` text NOT NULL,
    \`trx_id\` text NOT NULL,
    \`provider\` text NOT NULL,
    \`payment_intent_id\` text,
    \`external_ref_id\` text,
    \`resolution_source\` text NOT NULL,
    \`consumed_at\` integer NOT NULL,
    PRIMARY KEY(\`merchant_id\`, \`trx_id\`),
    FOREIGN KEY (\`merchant_id\`) REFERENCES \`merchants\`(\`id\`) ON UPDATE no action ON DELETE no action
  )`,

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

const ALTER_COLUMN_STATEMENTS: readonly string[] = [
  // 0002 + 0003 columns
  `ALTER TABLE \`sms_ledger\` ADD COLUMN \`match_type\` text`,
  `ALTER TABLE \`sms_ledger\` ADD COLUMN \`sms_sender\` text`,
  `ALTER TABLE \`sms_ledger\` ADD COLUMN \`source\` text DEFAULT 'SMS' NOT NULL`,
  `ALTER TABLE \`sms_ledger\` ADD COLUMN \`trust_flag\` text`,
  `ALTER TABLE \`verification_queue\` ADD COLUMN \`base_amount\` real`,
  `ALTER TABLE \`verification_queue\` ADD COLUMN \`unique_amount\` real`,
  `ALTER TABLE \`verification_queue\` ADD COLUMN \`submitted_amount\` real`,

  // 0005 columns
  `ALTER TABLE \`merchants\` ADD COLUMN \`verification_mode\` text DEFAULT 'AUTO' NOT NULL`,
  `ALTER TABLE \`merchants\` ADD COLUMN \`allow_base_amount_fallback\` integer DEFAULT 1 NOT NULL`,
  `ALTER TABLE \`merchants\` ADD COLUMN \`receipt_policy\` text DEFAULT 'OFFLINE_OPTIONAL' NOT NULL`,
  `ALTER TABLE \`merchants\` ADD COLUMN \`late_sms_auto_approve\` integer DEFAULT 0 NOT NULL`,
  `ALTER TABLE \`merchants\` ADD COLUMN \`enabled_modules_json\` text DEFAULT '{"ecommerce_fulfillment":true,"phone_otp":false,"telegram_alerts":false}' NOT NULL`,
  `ALTER TABLE \`merchants\` ADD COLUMN \`allowed_callback_origins_json\` text DEFAULT '[]' NOT NULL`,
  `ALTER TABLE \`merchants\` ADD COLUMN \`api_key_hash\` text`,
  `ALTER TABLE \`merchants\` ADD COLUMN \`api_key_prefix\` text`,
  `ALTER TABLE \`merchants\` ADD COLUMN \`publishable_key\` text`,
  `ALTER TABLE \`merchants\` ADD COLUMN \`telegram_bot_token\` text`,
  `ALTER TABLE \`merchants\` ADD COLUMN \`telegram_chat_id\` text`,
  `ALTER TABLE \`checkout_sessions\` ADD COLUMN \`payment_intent_id\` text`,
  `ALTER TABLE \`checkout_sessions\` ADD COLUMN \`vertical\` text DEFAULT 'ecommerce' NOT NULL`,
  `ALTER TABLE \`checkout_sessions\` ADD COLUMN \`display_json\` text`,
  `ALTER TABLE \`checkout_sessions\` ADD COLUMN \`actions_json\` text`,
  `ALTER TABLE \`verification_queue\` ADD COLUMN \`payment_intent_id\` text`,
  `ALTER TABLE \`verification_queue\` ADD COLUMN \`receipt_asset_id\` text`,
  `ALTER TABLE \`verification_queue\` ADD COLUMN \`receipt_url\` text`,
  `ALTER TABLE \`verification_queue\` ADD COLUMN \`escalation_reason\` text`,
  `ALTER TABLE \`verification_queue\` ADD COLUMN \`escalated_at\` integer`,
  `ALTER TABLE \`verification_queue\` ADD COLUMN \`resolved_at\` integer`,
  `ALTER TABLE \`sms_ledger\` ADD COLUMN \`payment_intent_id\` text`,
  `ALTER TABLE \`merchant_orders\` ADD COLUMN \`payment_intent_id\` text`,
];

const POST_ALTER_INDEX_STATEMENTS: readonly string[] = [
  `CREATE INDEX IF NOT EXISTS \`idx_merchants_api_key_hash\` ON \`merchants\` (\`api_key_hash\`)`,
  `CREATE INDEX IF NOT EXISTS \`idx_queue_intent\` ON \`verification_queue\` (\`payment_intent_id\`)`,
];

const CORE_HEALTH_TABLES = [
  'merchants',
  'otp_codes',
  'app_releases',
  'payment_intents',
  'payment_links',
  'consumed_trx_ids',
  'admin_users',
  'admin_sessions',
  'admin_audit_logs',
] as const;

let schemaReadyPromise: Promise<void> | null = null;

function isIgnorableSchemaError(err: unknown): boolean {
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  return (
    msg.includes('duplicate column name') ||
    msg.includes('already exists') ||
    msg.includes('no such table')
  );
}

/**
 * Idempotently ensures all runtime-critical D1 tables and columns across migrations
 * 0001–0006 exist even if remote migrations lag behind.
 */
export function ensureRuntimeSchema(
  db: AppDb,
  options?: { force?: boolean }
): Promise<void> {
  if (options?.force) {
    schemaReadyPromise = null;
  }

  if (!schemaReadyPromise) {
    schemaReadyPromise = (async () => {
      for (const stmt of CORE_TABLE_STATEMENTS) {
        await db.run(sql.raw(stmt));
      }
      for (const alterStmt of ALTER_COLUMN_STATEMENTS) {
        try {
          await db.run(sql.raw(alterStmt));
        } catch (err) {
          if (!isIgnorableSchemaError(err)) {
            throw err;
          }
        }
      }
      for (const idxStmt of POST_ALTER_INDEX_STATEMENTS) {
        try {
          await db.run(sql.raw(idxStmt));
        } catch (err) {
          if (!isIgnorableSchemaError(err)) {
            throw err;
          }
        }
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
