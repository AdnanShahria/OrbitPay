ALTER TABLE `sms_ledger` ADD COLUMN `sms_sender` text;
--> statement-breakpoint
ALTER TABLE `sms_ledger` ADD COLUMN `source` text DEFAULT 'SMS' NOT NULL;
--> statement-breakpoint
ALTER TABLE `sms_ledger` ADD COLUMN `trust_flag` text;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `otp_codes` (
	`id` text PRIMARY KEY NOT NULL,
	`merchant_id` text,
	`purpose` text NOT NULL,
	`phone` text NOT NULL,
	`code_hash` text NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`provider` text,
	`expires_at` integer NOT NULL,
	`consumed_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_otp_phone` ON `otp_codes` (`phone`,`purpose`,`created_at`);
