-- Hand-fixed after generation (same reasoning as prior migrations):
-- 1. REFERENCES cards(id)/users(id)/documents(id) — review's TS schema
--    (packages/core/src/review/infra/schema.ts) has no object reference
--    across module/package boundaries, same cross-module FK limitation as
--    every prior migration.
-- 2. `rating ... CHECK (rating BETWEEN 1 AND 4)` — matches
--    docs/modules/review.md's DDL exactly.
-- 3. idx_schedules_due and idx_reviews_card — docs/modules/review.md's
--    explicit indexes; drizzle-kit generated none since it had no
--    `.references()` to build them from.
CREATE TABLE `card_schedules` (
	`card_id` text PRIMARY KEY NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
	`user_id` text NOT NULL REFERENCES users(id),
	`due` text NOT NULL,
	`stability` real NOT NULL,
	`difficulty` real NOT NULL,
	`reps` integer DEFAULT 0 NOT NULL,
	`lapses` integer DEFAULT 0 NOT NULL,
	`last_reviewed_at` text
);
--> statement-breakpoint
CREATE INDEX `idx_schedules_due` ON `card_schedules` (`user_id`,`due`);
--> statement-breakpoint
CREATE TABLE `reviews` (
	`id` text PRIMARY KEY NOT NULL,
	`card_id` text NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
	`user_id` text NOT NULL REFERENCES users(id),
	`rating` integer NOT NULL CHECK (rating BETWEEN 1 AND 4),
	`reviewed_at` text NOT NULL,
	`elapsed_ms` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_reviews_card` ON `reviews` (`card_id`,`reviewed_at` DESC);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL REFERENCES users(id),
	`document_id` text REFERENCES documents(id) ON DELETE SET NULL,
	`started_at` text NOT NULL,
	`ended_at` text
);
