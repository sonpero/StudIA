-- Hand-fixed after generation (same reasoning as prior migrations):
-- 1. `notion_id ... REFERENCES notions(id) ON DELETE CASCADE` and
--    `user_id ... REFERENCES users(id)` — generation's TS schema
--    (packages/core/src/generation/infra/schema.ts) has no object reference
--    across module/package boundaries, same cross-module FK limitation as
--    every prior migration.
-- 2. `type`/`state` CHECK constraints — match docs/modules/generation.md's
--    DDL; drizzle-orm's `{ enum: [...] }` is TypeScript-only.
-- 3. idx_cards_notion and idx_cards_user_active — docs/modules/generation.md's
--    explicit indexes; drizzle-kit generated none from the TS schema since
--    it has no `.references()` to build them from.
CREATE TABLE `cards` (
	`id` text PRIMARY KEY NOT NULL,
	`notion_id` text NOT NULL REFERENCES notions(id) ON DELETE CASCADE,
	`user_id` text NOT NULL REFERENCES users(id),
	`type` text NOT NULL CHECK (type IN ('flashcard','mcq','open')),
	`state` text DEFAULT 'active' NOT NULL CHECK (state IN ('active','stale')),
	`question` text NOT NULL,
	`answer` text NOT NULL,
	`options_json` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_cards_notion` ON `cards` (`notion_id`);
--> statement-breakpoint
CREATE INDEX `idx_cards_user_active` ON `cards` (`user_id`,`state`);
