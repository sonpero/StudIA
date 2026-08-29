-- Hand-fixed after generation to match docs/modules/workspace.md's DDL:
-- 1. `user_id ... REFERENCES users(id)`, `document_id ... REFERENCES
--    documents(id) ON DELETE SET NULL` — drizzle-kit cannot follow the
--    cross-module relative import needed to declare these via drizzle's
--    object-reference API (see infra/schema.ts's comment).
-- 2. `source` CHECK constraint — this drizzle-orm version's
--    `{ enum: [...] }` column option is TypeScript-only, no CHECK emitted.
CREATE TABLE `todos` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL REFERENCES users(id),
	`label` text NOT NULL,
	`due_date` text,
	`document_id` text REFERENCES documents(id) ON DELETE SET NULL,
	`done` integer DEFAULT false NOT NULL,
	`source` text NOT NULL CHECK (source IN ('manual','photo')),
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_todos_user` ON `todos` (`user_id`,`done`,`due_date`);