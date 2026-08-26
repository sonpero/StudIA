import { integer, primaryKey, sqliteTable, text, unique } from "drizzle-orm/sqlite-core";

// user_id has no drizzle `.references()` object-reference to identity's
// usersTable, unlike a normal cross-module import (ingestion isn't a frozen
// kernel, so that import would otherwise be fine): drizzle-kit loads each
// glob-matched schema.ts via a plain require with no bundler, and cannot
// follow this repo's NodeNext `.js`-suffixed relative imports across
// module folders (same root cause as jobs/infra/schema.ts's user_id, and
// apps/api/drizzle.config.ts's comment). REFERENCES users(id) is added by
// hand in the generated migration instead — see apps/api/drizzle/.
export const documentsTable = sqliteTable("documents", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  title: text("title").notNull(),
  sourceType: text("source_type", { enum: ["photo", "pdf", "docx", "pptx"] }).notNull(),
  status: text("status", { enum: ["pending", "running", "done", "failed"] }).notNull(),
  colour: text("colour").notNull(),
  createdAt: text("created_at").notNull(),
});

export const pagesTable = sqliteTable(
  "pages",
  {
    documentId: text("document_id")
      .notNull()
      .references(() => documentsTable.id, { onDelete: "cascade" }),
    pageIndex: integer("page_index").notNull(),
    sha256: text("sha256").notNull(),
    storedPath: text("stored_path").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.documentId, table.pageIndex] }),
    unique("pages_document_sha256_unique").on(table.documentId, table.sha256),
  ],
);

export const extractionsTable = sqliteTable("extractions", {
  documentId: text("document_id")
    .primaryKey()
    .references(() => documentsTable.id, { onDelete: "cascade" }),
  markdown: text("markdown").notNull(),
  extractedAt: text("extracted_at").notNull(),
});
