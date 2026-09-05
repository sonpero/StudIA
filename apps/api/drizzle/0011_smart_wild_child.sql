-- Hand-fixed after generation (same reasoning as every other cross-module
-- FK in this repo, e.g. 0003_cheerful_joseph.sql's notions table):
-- 1. `user_id ... REFERENCES users(id)` and
--    `document_id ... REFERENCES documents(id) ON DELETE CASCADE` on
--    conversations -- tutor's TS schema (packages/core/src/tutor/infra/
--    schema.ts) has no object reference to identity's usersTable or
--    ingestion's documentsTable: drizzle-kit's schema loader cannot follow
--    this repo's NodeNext `.js`-suffixed relative imports across module
--    boundaries. `messages.conversation_id` needed no such fix: it
--    references this same module's own conversations table, so drizzle-kit
--    already emitted its FOREIGN KEY clause below correctly.
-- 2. `role ... CHECK (role IN ('user','assistant'))` -- matches
--    docs/modules/tutor.md's DDL; this drizzle-orm version's
--    `{ enum: [...] }` column option is TypeScript-only and emits no CHECK.
-- 3. Two indexes matching each repository method's actual query shape
--    (docs/modules/tutor.md did not list them explicitly, same gap content's
--    idx_notions_document once filled): listConversations reads by
--    (user_id, document_id), listMessages reads by conversation_id.
CREATE TABLE `conversations` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL REFERENCES users(id),
	`document_id` text NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
	`title` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_conversations_scope` ON `conversations` (`user_id`,`document_id`);
--> statement-breakpoint
CREATE TABLE `messages` (
	`id` text PRIMARY KEY NOT NULL,
	`conversation_id` text NOT NULL,
	`role` text NOT NULL CHECK (role IN ('user','assistant')),
	`content` text NOT NULL,
	`citations_json` text,
	`partial` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_messages_conversation` ON `messages` (`conversation_id`);
