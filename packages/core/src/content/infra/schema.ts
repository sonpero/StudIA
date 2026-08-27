import { integer, sqliteTable, text, unique } from "drizzle-orm/sqlite-core";

// document_id and user_id have no drizzle `.references()` object-reference
// (same reason as ingestion's pagesTable.documentId and documentsTable.userId,
// packages/core/src/ingestion/infra/schema.ts): drizzle-kit loads each
// glob-matched schema.ts via a plain require with no bundler, and cannot
// follow this repo's NodeNext `.js`-suffixed relative imports across module
// folders. REFERENCES documents(id)/users(id) are added by hand in the
// generated migration instead (see apps/api/drizzle/). The notions_fts
// virtual table and its sync triggers (docs/modules/content.md) have no
// drizzle-orm representation at all and are appended by hand to the same
// generated migration file.
export const notionsTable = sqliteTable(
  "notions",
  {
    id: text("id").primaryKey(),
    documentId: text("document_id").notNull(),
    userId: text("user_id").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    difficulty: text("difficulty", { enum: ["easy", "medium", "hard"] }).notNull(),
    position: integer("position").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [unique("notions_document_position_unique").on(table.documentId, table.position)],
);
