CREATE TABLE IF NOT EXISTS `admin_users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`full_name` text NOT NULL,
	`password_hash` text NOT NULL,
	`role` text DEFAULT 'ADMIN_OPERATOR' NOT NULL,
	`is_active` integer DEFAULT 1 NOT NULL,
	`last_login_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `unique_admin_user_email` ON `admin_users` (`email`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `admin_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`admin_user_id` text,
	`admin_email` text,
	`auth_method` text NOT NULL,
	`role` text NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`last_seen_at` integer,
	`expires_at` integer NOT NULL,
	`revoked_at` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_admin_sessions_active` ON `admin_sessions` (`revoked_at`,`expires_at`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_admin_sessions_user` ON `admin_sessions` (`admin_user_id`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `admin_audit_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`admin_user_id` text,
	`admin_email` text,
	`session_id` text,
	`action` text NOT NULL,
	`target_type` text,
	`target_id` text,
	`metadata_json` text,
	`ip_address` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_admin_audit_created` ON `admin_audit_logs` (`created_at`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_admin_audit_action` ON `admin_audit_logs` (`action`);
