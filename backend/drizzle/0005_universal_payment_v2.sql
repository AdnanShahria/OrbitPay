-- Universal Orbit Payment Hub v2 Migration
-- Adds multi-vertical payment_intents, payment_links, consumed_trx_ids,
-- merchant mode/policy/key columns, and session/queue escalation tracking.

ALTER TABLE `merchants` ADD COLUMN `verification_mode` text DEFAULT 'AUTO' NOT NULL;
--> statement-breakpoint
ALTER TABLE `merchants` ADD COLUMN `allow_base_amount_fallback` integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
ALTER TABLE `merchants` ADD COLUMN `receipt_policy` text DEFAULT 'OFFLINE_OPTIONAL' NOT NULL;
--> statement-breakpoint
ALTER TABLE `merchants` ADD COLUMN `late_sms_auto_approve` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `merchants` ADD COLUMN `enabled_modules_json` text DEFAULT '{"ecommerce_fulfillment":true,"phone_otp":false,"telegram_alerts":false}' NOT NULL;
--> statement-breakpoint
ALTER TABLE `merchants` ADD COLUMN `allowed_callback_origins_json` text DEFAULT '[]' NOT NULL;
--> statement-breakpoint
ALTER TABLE `merchants` ADD COLUMN `api_key_hash` text;
--> statement-breakpoint
ALTER TABLE `merchants` ADD COLUMN `api_key_prefix` text;
--> statement-breakpoint
ALTER TABLE `merchants` ADD COLUMN `publishable_key` text;
--> statement-breakpoint
ALTER TABLE `merchants` ADD COLUMN `telegram_bot_token` text;
--> statement-breakpoint
ALTER TABLE `merchants` ADD COLUMN `telegram_chat_id` text;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_merchants_api_key_hash` ON `merchants` (`api_key_hash`);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS `payment_intents` (
	`id` text PRIMARY KEY NOT NULL,
	`merchant_id` text NOT NULL,
	`vertical` text DEFAULT 'ecommerce' NOT NULL,
	`external_ref_id` text NOT NULL,
	`verification_mode` text DEFAULT 'AUTO' NOT NULL,
	`status` text DEFAULT 'OPEN' NOT NULL,
	`base_amount` real NOT NULL,
	`unique_amount` real NOT NULL,
	`paid_amount` real,
	`provider` text,
	`trx_id` text,
	`sender_number` text,
	`receipt_asset_id` text,
	`receipt_url` text,
	`match_type` text,
	`trust_flag` text,
	`device_online_at_submit` integer,
	`sms_ledger_id` text,
	`sms_reconciliation_state` text,
	`escalation_reason` text,
	`resolution_source` text,
	`resolved_by_json` text,
	`rejection_reason` text,
	`callback_url` text,
	`return_url` text,
	`cancel_url` text,
	`customer_json` text,
	`display_json` text,
	`actions_json` text,
	`metadata_json` text,
	`state_version` integer DEFAULT 1 NOT NULL,
	`submit_attempts` integer DEFAULT 0 NOT NULL,
	`grace_expires_at` integer,
	`expires_at` integer NOT NULL,
	`verified_at` integer,
	`resolved_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `uq_payment_intent_merchant_ref` ON `payment_intents` (`merchant_id`,`external_ref_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_payment_intents_status` ON `payment_intents` (`merchant_id`,`status`,`created_at`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_payment_intents_trx` ON `payment_intents` (`merchant_id`,`trx_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_payment_intents_grace` ON `payment_intents` (`status`,`grace_expires_at`);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS `payment_links` (
	`id` text PRIMARY KEY NOT NULL,
	`merchant_id` text NOT NULL,
	`slug` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`vertical` text DEFAULT 'custom' NOT NULL,
	`amount_type` text DEFAULT 'FIXED' NOT NULL,
	`fixed_amount` real,
	`min_amount` real,
	`max_amount` real,
	`currency` text DEFAULT 'BDT' NOT NULL,
	`verification_mode` text,
	`display_json` text,
	`actions_json` text,
	`metadata_json` text,
	`return_url` text,
	`cancel_url` text,
	`is_active` integer DEFAULT 1 NOT NULL,
	`max_uses` integer,
	`used_count` integer DEFAULT 0 NOT NULL,
	`expires_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `uq_payment_links_slug` ON `payment_links` (`slug`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_payment_links_merchant` ON `payment_links` (`merchant_id`,`is_active`);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS `consumed_trx_ids` (
	`merchant_id` text NOT NULL,
	`trx_id` text NOT NULL,
	`provider` text NOT NULL,
	`payment_intent_id` text,
	`external_ref_id` text,
	`resolution_source` text NOT NULL,
	`consumed_at` integer NOT NULL,
	PRIMARY KEY(`merchant_id`, `trx_id`),
	FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint

ALTER TABLE `checkout_sessions` ADD COLUMN `payment_intent_id` text;
--> statement-breakpoint
ALTER TABLE `checkout_sessions` ADD COLUMN `vertical` text DEFAULT 'ecommerce' NOT NULL;
--> statement-breakpoint
ALTER TABLE `checkout_sessions` ADD COLUMN `display_json` text;
--> statement-breakpoint
ALTER TABLE `checkout_sessions` ADD COLUMN `actions_json` text;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `uq_active_unique_amount` ON `checkout_sessions` (`merchant_id`,`unique_amount`) WHERE `status` IN ('OPEN', 'SUBMITTED');
--> statement-breakpoint

ALTER TABLE `verification_queue` ADD COLUMN `payment_intent_id` text;
--> statement-breakpoint
ALTER TABLE `verification_queue` ADD COLUMN `receipt_asset_id` text;
--> statement-breakpoint
ALTER TABLE `verification_queue` ADD COLUMN `receipt_url` text;
--> statement-breakpoint
ALTER TABLE `verification_queue` ADD COLUMN `escalation_reason` text;
--> statement-breakpoint
ALTER TABLE `verification_queue` ADD COLUMN `escalated_at` integer;
--> statement-breakpoint
ALTER TABLE `verification_queue` ADD COLUMN `resolved_at` integer;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_queue_intent` ON `verification_queue` (`payment_intent_id`);
--> statement-breakpoint

ALTER TABLE `sms_ledger` ADD COLUMN `payment_intent_id` text;
--> statement-breakpoint
ALTER TABLE `merchant_orders` ADD COLUMN `payment_intent_id` text;
