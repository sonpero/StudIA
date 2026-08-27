import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

// card_id/user_id/document_id have no drizzle `.references()` object-reference
// (same cross-module reason as every other module's schema.ts).
// REFERENCES are added by hand in the generated migration instead.
export const cardSchedulesTable = sqliteTable("card_schedules", {
  cardId: text("card_id").primaryKey(),
  userId: text("user_id").notNull(),
  due: text("due").notNull(),
  stability: real("stability").notNull(),
  difficulty: real("difficulty").notNull(),
  reps: integer("reps").notNull().default(0),
  lapses: integer("lapses").notNull().default(0),
  lastReviewedAt: text("last_reviewed_at"),
});

export const reviewsTable = sqliteTable("reviews", {
  id: text("id").primaryKey(),
  cardId: text("card_id").notNull(),
  userId: text("user_id").notNull(),
  rating: integer("rating").notNull(),
  reviewedAt: text("reviewed_at").notNull(),
  elapsedMs: integer("elapsed_ms").notNull(),
});

export const sessionsTable = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  documentId: text("document_id"),
  startedAt: text("started_at").notNull(),
  endedAt: text("ended_at"),
});
