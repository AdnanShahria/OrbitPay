CREATE TABLE `media_assets` (
	`id` text PRIMARY KEY NOT NULL,
	`merchant_id` text,
	`file_name` text NOT NULL,
	`mime_type` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`sha256` text NOT NULL,
	`primary_provider` text NOT NULL,
	`storage_key` text NOT NULL,
	`public_url` text,
	`fallback_locations_json` text,
	`data_base64` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_media_merchant` ON `media_assets` (`merchant_id`,`created_at`);
--> statement-breakpoint
CREATE TABLE `router_kv_store` (
	`key` text PRIMARY KEY NOT NULL,
	`value_json` text NOT NULL,
	`expires_at` integer,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `router_provider_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`channel` text NOT NULL,
	`selected_provider` text,
	`status` text NOT NULL,
	`fallback_triggered` integer DEFAULT false NOT NULL,
	`attempts_json` text NOT NULL,
	`latency_ms` integer NOT NULL,
	`caller_id` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_router_logs_channel` ON `router_provider_logs` (`channel`,`created_at`);
