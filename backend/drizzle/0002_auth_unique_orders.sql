ALTER TABLE `sms_ledger` ADD COLUMN `match_type` text;
--> statement-breakpoint
ALTER TABLE `verification_queue` ADD COLUMN `base_amount` real;
--> statement-breakpoint
ALTER TABLE `verification_queue` ADD COLUMN `unique_amount` real;
--> statement-breakpoint
ALTER TABLE `verification_queue` ADD COLUMN `submitted_amount` real;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `checkout_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`merchant_id` text NOT NULL,
	`external_order_id` text NOT NULL,
	`customer_email` text NOT NULL,
	`base_amount` real NOT NULL,
	`unique_amount` real NOT NULL,
	`offset_cents` integer NOT NULL,
	`provider` text,
	`status` text DEFAULT 'OPEN' NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_checkout_active` ON `checkout_sessions` (`merchant_id`,`base_amount`,`status`,`expires_at`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_checkout_order` ON `checkout_sessions` (`merchant_id`,`external_order_id`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `merchant_users` (
	`id` text PRIMARY KEY NOT NULL,
	`merchant_id` text NOT NULL,
	`email` text NOT NULL,
	`full_name` text NOT NULL,
	`password_hash` text NOT NULL,
	`role` text DEFAULT 'MERCHANT_OWNER' NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`last_login_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `unique_merchant_user_email` ON `merchant_users` (`email`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_merchant_users_merchant` ON `merchant_users` (`merchant_id`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `auth_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`merchant_id` text NOT NULL,
	`device_type` text NOT NULL,
	`device_name` text,
	`ip_address` text,
	`expires_at` integer NOT NULL,
	`revoked_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `merchant_users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_auth_sessions_user` ON `auth_sessions` (`user_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_auth_sessions_merchant` ON `auth_sessions` (`merchant_id`,`revoked_at`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `merchant_devices` (
	`id` text PRIMARY KEY NOT NULL,
	`merchant_id` text NOT NULL,
	`user_id` text,
	`device_name` text NOT NULL,
	`device_key_hash` text NOT NULL,
	`fcm_token` text,
	`last_seen_at` integer,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `merchant_users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_merchant_devices_key` ON `merchant_devices` (`device_key_hash`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_merchant_devices_merchant` ON `merchant_devices` (`merchant_id`,`is_active`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `merchant_orders` (
	`id` text PRIMARY KEY NOT NULL,
	`merchant_id` text NOT NULL,
	`external_order_id` text NOT NULL,
	`customer_name` text,
	`customer_phone` text,
	`customer_email` text,
	`shipping_address` text,
	`items_summary` text,
	`payment_method` text DEFAULT 'ORBIT_MFS' NOT NULL,
	`payment_status` text DEFAULT 'UNPAID' NOT NULL,
	`order_status` text DEFAULT 'NEW' NOT NULL,
	`base_amount` real NOT NULL,
	`unique_amount` real,
	`paid_amount` real,
	`trx_id` text,
	`match_type` text,
	`store_callback_url` text,
	`metadata_json` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `unique_merchant_order` ON `merchant_orders` (`merchant_id`,`external_order_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_merchant_orders_status` ON `merchant_orders` (`merchant_id`,`order_status`,`created_at`);
