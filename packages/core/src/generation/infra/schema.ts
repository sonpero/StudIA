import { sqliteTable, text } from "drizzle-orm/sqlite-core";

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
