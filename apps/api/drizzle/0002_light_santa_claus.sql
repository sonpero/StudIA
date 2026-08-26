-- Hand-fixed after generation to match docs/modules/ingestion.md's DDL:
-- 1. `documents.user_id ... REFERENCES users(id)` — drizzle-kit cannot
--    follow the cross-module relative import needed to declare this via
--    drizzle's object-reference API (see infra/schema.ts's comment).
-- 2. `source_type`/`status` CHECK constraints — this drizzle-orm version's
--    `{ enum: [...] }` column option is TypeScript-only, no CHECK emitted.
CREATE TABLE `documents` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL REFERENCES users(id),
	`title` text NOT NULL,
	`source_type` text NOT NULL CHECK (source_type IN ('photo','pdf','docx','pptx')),
	`status` text NOT NULL CHECK (status IN ('pending','running','done','failed')),
	`colour` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `extractions` (
	`document_id` text PRIMARY KEY NOT NULL,
	`markdown` text NOT NULL,
	`extracted_at` text NOT NULL,
	FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `pages` (
	`document_id` text NOT NULL,
	`page_index` integer NOT NULL,
	`sha256` text NOT NULL,
	`stored_path` text NOT NULL,
	`size_bytes` integer NOT NULL,
	PRIMARY KEY(`document_id`, `page_index`),
	FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `pages_document_sha256_unique` ON `pages` (`document_id`,`sha256`);
