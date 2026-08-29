import { integer, primaryKey, sqliteTable, text, unique } from "drizzle-orm/sqlite-core";

// document_id/user_id have no drizzle `.references()` object-reference
// across module/package boundaries (same cross-module FK limitation as
// every prior migration — see CLAUDE.md's SQLite specifics). REFERENCES
// documents(id)/users(id) are added by hand in the generated migration
// instead (see apps/api/drizzle/).
export const deadlinesTable = sqliteTable(
  "deadlines",
  {
    id: text("id").primaryKey(),
    documentId: text("document_id").notNull(),
    userId: text("user_id").notNull(),
    date: text("date").notNull(),
    label: text("label"),
    createdAt: text("created_at").notNull(),
  },
  // "Set or update" (docs/modules/progress.md's API): one deadline per
  // document, upserted by the repository on this constraint.
  (table) => [unique("deadlines_document_unique").on(table.documentId)],
);

export const availabilityTable = sqliteTable("availability", {
  userId: text("user_id").primaryKey(),
  minutesJson: text("minutes_json").notNull(),
});

export const planHistoryTable = sqliteTable(
  "plan_history",
  {
    userId: text("user_id").notNull(),
    date: text("date").notNull(),
    completed: integer("completed", { mode: "boolean" }).notNull().default(false),
  },
  (table) => [primaryKey({ columns: [table.userId, table.date] })],
);
