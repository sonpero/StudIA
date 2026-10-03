-- M11 key notions (docs/reports/notions-cles-conception.md). Additive only:
-- three new tables, no existing table or row touched. Rollback is
-- DROP TABLE key_notion_cards; DROP TABLE key_notion_sources;
-- DROP TABLE key_notions;
-- Hand-fixed after generation (same reasons as every earlier migration):
-- 1. REFERENCES and ON DELETE clauses: drizzle-kit cannot follow the
--    cross-module imports a `.references()` call would need
--    (packages/core/src/generation/infra/schema.ts's comment).
-- 2. CHECK constraints: drizzle's `{ enum }`/`{ mode: "boolean" }` column
--    options are TypeScript-only and emit none.
-- 3. Statement order (key_notions first) and the two lookup indexes on the
--    columns each ON DELETE CASCADE searches by.
CREATE TABLE `key_notions` (
	`id` text PRIMARY KEY NOT NULL,
	`document_id` text NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
	`user_id` text NOT NULL REFERENCES users(id),
	`title` text NOT NULL,
	`summary` text NOT NULL,
	`importance` text NOT NULL CHECK (importance IN ('essential','important')),
	`is_synthesis` integer NOT NULL CHECK (is_synthesis IN (0,1)),
	`section` text NOT NULL,
	`position` integer NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `key_notions_document_position_unique` ON `key_notions` (`document_id`,`position`);
--> statement-breakpoint
CREATE TABLE `key_notion_sources` (
	`key_notion_id` text NOT NULL REFERENCES key_notions(id) ON DELETE CASCADE,
	`notion_id` text NOT NULL REFERENCES notions(id) ON DELETE CASCADE,
	`user_id` text NOT NULL REFERENCES users(id),
	PRIMARY KEY(`key_notion_id`, `notion_id`)
);
--> statement-breakpoint
CREATE INDEX `key_notion_sources_notion_idx` ON `key_notion_sources` (`notion_id`);
--> statement-breakpoint
CREATE TABLE `key_notion_cards` (
	`card_id` text PRIMARY KEY NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
	`key_notion_id` text NOT NULL REFERENCES key_notions(id) ON DELETE CASCADE,
	`user_id` text NOT NULL REFERENCES users(id)
);
--> statement-breakpoint
CREATE INDEX `key_notion_cards_key_notion_idx` ON `key_notion_cards` (`key_notion_id`);
