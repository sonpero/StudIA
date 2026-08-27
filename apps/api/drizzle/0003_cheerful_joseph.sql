-- Hand-fixed after generation (same reasoning as 0001_lazy_banshee.sql and
-- 0002_light_santa_claus.sql):
-- 1. `document_id ... REFERENCES documents(id) ON DELETE CASCADE` and
--    `user_id ... REFERENCES users(id)` — content's TS schema
--    (packages/core/src/content/infra/schema.ts) has no object reference to
--    ingestion's documentsTable or identity's usersTable: drizzle-kit's
--    schema loader cannot follow this repo's NodeNext `.js`-suffixed
--    relative imports across module/package boundaries.
-- 2. `difficulty ... CHECK (difficulty IN (...))` — matches
--    docs/modules/content.md's DDL; this drizzle-orm version's
--    `{ enum: [...] }` column option is TypeScript-only and emits no CHECK.
-- 3. The notions_fts virtual table and its sync triggers
--    (docs/modules/content.md) have no drizzle-orm representation at all;
--    appended here by hand, written with the table as content.md requires
--    ("write the triggers with the table, not later: an out-of-sync FTS
--    index fails silently").
CREATE TABLE `notions` (
	`id` text PRIMARY KEY NOT NULL,
	`document_id` text NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
	`user_id` text NOT NULL REFERENCES users(id),
	`title` text NOT NULL,
	`body` text NOT NULL,
	`difficulty` text NOT NULL CHECK (difficulty IN ('easy','medium','hard')),
	`position` integer NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `notions_document_position_unique` ON `notions` (`document_id`,`position`);
--> statement-breakpoint
CREATE VIRTUAL TABLE notions_fts USING fts5(
  title, body, content='notions', content_rowid='rowid'
);
--> statement-breakpoint
CREATE TRIGGER notions_ai AFTER INSERT ON notions BEGIN
  INSERT INTO notions_fts(rowid, title, body) VALUES (new.rowid, new.title, new.body);
END;
--> statement-breakpoint
CREATE TRIGGER notions_ad AFTER DELETE ON notions BEGIN
  INSERT INTO notions_fts(notions_fts, rowid, title, body) VALUES('delete', old.rowid, old.title, old.body);
END;
--> statement-breakpoint
CREATE TRIGGER notions_au AFTER UPDATE ON notions BEGIN
  INSERT INTO notions_fts(notions_fts, rowid, title, body) VALUES('delete', old.rowid, old.title, old.body);
  INSERT INTO notions_fts(rowid, title, body) VALUES (new.rowid, new.title, new.body);
END;
