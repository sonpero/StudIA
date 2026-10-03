import { integer, primaryKey, sqliteTable, text, unique } from "drizzle-orm/sqlite-core";

// notion_id and user_id have no drizzle `.references()` object-reference,
// same reason as content's notionsTable.documentId
// (packages/core/src/content/infra/schema.ts): drizzle-kit's schema loader
// cannot follow this repo's NodeNext `.js`-suffixed relative imports across
// module folders. REFERENCES notions(id)/users(id) are added by hand in the
// generated migration instead (see apps/api/drizzle/).
export const cardsTable = sqliteTable("cards", {
  id: text("id").primaryKey(),
  notionId: text("notion_id").notNull(),
  userId: text("user_id").notNull(),
  type: text("type", { enum: ["flashcard", "mcq", "open"] }).notNull(),
  state: text("state", { enum: ["active", "stale"] }).notNull().default("active"),
  question: text("question").notNull(),
  answer: text("answer").notNull(),
  optionsJson: text("options_json", { mode: "json" }).$type<string[] | null>(),
  createdAt: text("created_at").notNull(),
});

// M11 key notions (docs/reports/notions-cles-conception.md). Same missing
// `.references()` as cardsTable above: REFERENCES documents/notions/users/
// cards, the ON DELETE clauses and the CHECK constraints are added by hand
// in migration 0013. All three tables are additive: `cards` is untouched,
// so dropping these three tables is the whole rollback.
export const keyNotionsTable = sqliteTable(
  "key_notions",
  {
    id: text("id").primaryKey(),
    documentId: text("document_id").notNull(),
    userId: text("user_id").notNull(),
    title: text("title").notNull(),
    summary: text("summary").notNull(),
    importance: text("importance", { enum: ["essential", "important"] }).notNull(),
    isSynthesis: integer("is_synthesis", { mode: "boolean" }).notNull(),
    section: text("section").notNull(),
    position: integer("position").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [unique("key_notions_document_position_unique").on(table.documentId, table.position)],
);

// The reading notions a key notion covers.
export const keyNotionSourcesTable = sqliteTable(
  "key_notion_sources",
  {
    keyNotionId: text("key_notion_id").notNull(),
    notionId: text("notion_id").notNull(),
    userId: text("user_id").notNull(),
  },
  (table) => [primaryKey({ columns: [table.keyNotionId, table.notionId] })],
);

// Which key notion a card was generated for. A separate table rather than
// a cards column: SQLite cannot DROP a column that carries a foreign key,
// so a column would make the rollback a rebuild of `cards` (and of the
// review history hanging off it).
export const keyNotionCardsTable = sqliteTable("key_notion_cards", {
  cardId: text("card_id").primaryKey(),
  keyNotionId: text("key_notion_id").notNull(),
  userId: text("user_id").notNull(),
});
