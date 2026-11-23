CREATE TABLE `merchant_wallets` (
	`id` text PRIMARY KEY NOT NULL,
	`merchant_id` text NOT NULL,
	`provider` text NOT NULL,
	`account_type` text DEFAULT 'PERSONAL' NOT NULL,
	`wallet_number` text NOT NULL,
	`monthly_volume_limit` real DEFAULT 300000 NOT NULL,
	`current_month_volume` real DEFAULT 0 NOT NULL,
	`is_primary` integer DEFAULT false NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`priority_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_wallets_lookup` ON `merchant_wallets` (`merchant_id`,`provider`,`is_active`);--> statement-breakpoint
CREATE TABLE `merchants` (
	`id` text PRIMARY KEY NOT NULL,
	`store_name` text NOT NULL,
	`webhook_url` text NOT NULL,
	`webhook_secret` text NOT NULL,
	`device_api_key_hash` text NOT NULL,
	`grace_period_minutes` integer DEFAULT 60 NOT NULL,
	`fcm_token` text,
	`last_seen_at` integer,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sms_ledger` (
	`id` text PRIMARY KEY NOT NULL,
	`merchant_id` text NOT NULL,
	`provider` text NOT NULL,
	`trx_id` text NOT NULL,
	`amount` real NOT NULL,
	`sender_number` text NOT NULL,
	`raw_sms` text NOT NULL,
	`status` text DEFAULT 'UNCLAIMED' NOT NULL,
	`external_order_id` text,
	`sms_received_at` integer NOT NULL,
	`verified_at` integer,
	FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `unique_merchant_trx` ON `sms_ledger` (`merchant_id`,`trx_id`);--> statement-breakpoint
CREATE INDEX `idx_ledger_status` ON `sms_ledger` (`merchant_id`,`status`);--> statement-breakpoint
CREATE TABLE `verification_queue` (
	`id` text PRIMARY KEY NOT NULL,
	`merchant_id` text NOT NULL,
	`provider` text NOT NULL,
	`external_order_id` text NOT NULL,
	`customer_email` text NOT NULL,
	`expected_amount` real NOT NULL,
	`submitted_trx_id` text NOT NULL,
	`submitted_sender` text NOT NULL,
	`status` text DEFAULT 'WAITING_FOR_SMS' NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_queue_lookup` ON `verification_queue` (`merchant_id`,`submitted_trx_id`,`status`);--> statement-breakpoint
CREATE TABLE `webhook_deliveries` (
	`id` text PRIMARY KEY NOT NULL,
	`merchant_id` text NOT NULL,
	`event_type` text DEFAULT 'payment.verified' NOT NULL,
	`external_order_id` text NOT NULL,
	`payload_json` text NOT NULL,
	`signature` text NOT NULL,
	`attempt_count` integer DEFAULT 1 NOT NULL,
	`status` text DEFAULT 'RETRYING' NOT NULL,
	`next_retry_at` integer,
	`delivered_at` integer,
	`last_attempt_at` integer,
	`response_status` integer,
	`response_body` text,
	FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON UPDATE no action ON DELETE no action
);
