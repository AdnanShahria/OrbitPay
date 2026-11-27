CREATE TABLE IF NOT EXISTS `app_releases` (
	`id` text PRIMARY KEY NOT NULL,
	`platform` text DEFAULT 'ANDROID' NOT NULL,
	`version_code` integer NOT NULL,
	`version_name` text NOT NULL,
	`min_supported_version_code` integer DEFAULT 1 NOT NULL,
	`mandatory` integer DEFAULT 0 NOT NULL,
	`release_notes` text DEFAULT '' NOT NULL,
	`file_name` text NOT NULL,
	`r2_key` text NOT NULL,
	`sha256` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`is_active` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `unique_app_release_version` ON `app_releases` (`platform`,`version_code`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_app_releases_latest` ON `app_releases` (`platform`,`is_active`,`version_code`);
