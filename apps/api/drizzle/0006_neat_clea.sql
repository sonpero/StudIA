-- Hand-fixed after generation (same reasoning as prior migrations):
-- REFERENCES documents(id)/users(id) — planning's TS schema
-- (packages/core/src/planning/infra/schema.ts) has no object reference
-- across module/package boundaries, same cross-module FK limitation as
-- every prior migration.
CREATE TABLE `availability` (
	`user_id` text PRIMARY KEY NOT NULL REFERENCES users(id),
	`minutes_json` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `deadlines` (
	`id` text PRIMARY KEY NOT NULL,
	`document_id` text NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
	`user_id` text NOT NULL REFERENCES users(id),
	`date` text NOT NULL,
	`label` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `deadlines_document_unique` ON `deadlines` (`document_id`);--> statement-breakpoint
CREATE TABLE `plan_history` (
	`user_id` text NOT NULL REFERENCES users(id),
	`date` text NOT NULL,
	`completed` integer DEFAULT false NOT NULL,
	PRIMARY KEY(`user_id`, `date`)
);
