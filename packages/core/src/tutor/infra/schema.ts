import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

// user_id and document_id have no drizzle `.references()` object-reference
// to identity's usersTable or ingestion's documentsTable (same reason as
// every other cross-module FK in this repo, e.g. content's notionsTable,
// packages/core/src/content/infra/schema.ts): drizzle-kit's schema loader
// cannot follow this repo's NodeNext `.js`-suffixed relative imports across
// module folders. REFERENCES users(id) / documents(id) are added by hand in
// the generated migration instead — see apps/api/drizzle/.
export const conversationsTable = sqliteTable("conversations", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  documentId: text("document_id").notNull(),
  title: text("title"), // null until the first question is asked (truncateTitle)
  createdAt: text("created_at").notNull(),
});

export const messagesTable = sqliteTable("messages", {
  id: text("id").primaryKey(),
  // Same module as conversationsTable, so the object-reference works and
  // drizzle-kit emits the FOREIGN KEY clause itself — unlike the two above.
  conversationId: text("conversation_id")
    .notNull()
    .references(() => conversationsTable.id, { onDelete: "cascade" }),
  role: text("role", { enum: ["user", "assistant"] }).notNull(),
  content: text("content").notNull(),
  // Citation[] snapshot, resolved once at write time, never recomputed
  // (docs/modules/tutor.md). drizzle's json mode handles (de)serialization;
  // no manual JSON.stringify/parse in the repository, same as generation's
  // Card.options / options_json.
  citationsJson: text("citations_json", { mode: "json" }).$type<{ text: string }[] | null>(),
  partial: integer("partial", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull(),
});
