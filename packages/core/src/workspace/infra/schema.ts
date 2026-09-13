import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

// user_id/document_id have no drizzle `.references()` object-reference
// across module/package boundaries (same cross-module FK limitation as
// every prior migration — see CLAUDE.md's SQLite specifics). REFERENCES
// users(id)/documents(id) are added by hand in the generated migration
// instead (see apps/api/drizzle/). document_id's ON DELETE SET NULL
// (docs/modules/workspace.md) is likewise added by hand: drizzle-kit only
// emits an ON DELETE clause alongside a `.references()` call.
export const todosTable = sqliteTable(
  "todos",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    label: text("label").notNull(),
    dueDate: text("due_date"),
    documentId: text("document_id"),
    // SQLite has no boolean type; drizzle's "boolean" mode stores 0/1 and
    // converts at the boundary, giving the TS side a real boolean without
    // the repository doing that conversion itself.
    done: integer("done", { mode: "boolean" }).notNull().default(false),
    source: text("source", { enum: ["manual", "photo"] }).notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [index("idx_todos_user").on(table.userId, table.done, table.dueDate)],
);

// job_id/user_id have the same cross-module FK limitation as above.
// Deliberately no ON DELETE CASCADE from jobs(id): jobs are never deleted
// (docs/modules/jobs.md), so this never needs to react to that.
export const todoProposalsTable = sqliteTable(
  "todo_proposals",
  {
    id: text("id").primaryKey(),
    jobId: text("job_id").notNull(),
    userId: text("user_id").notNull(),
    label: text("label").notNull(),
    dueDate: text("due_date"),
    subjectHint: text("subject_hint"),
    createdAt: text("created_at").notNull(),
  },
  (table) => [index("idx_proposals_job").on(table.jobId)],
);

// user_id has the same cross-module FK limitation as above (REFERENCES
// users(id) added by hand in the generated migration). todo_id is the
// exception: it references this same file's own todosTable, same module,
// so .references() works directly here and drizzle-kit emits the
// REFERENCES/ON DELETE clause on its own — no hand-edit needed for this
// one column (docs/modules/workspace.md's "Pomodoro (M7)" note).
export const pomodoroSessionsTable = sqliteTable(
  "pomodoro_sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    todoId: text("todo_id").references(() => todosTable.id, { onDelete: "set null" }),
    startedAt: text("started_at").notNull(),
    endedAt: text("ended_at"),
    durationSeconds: integer("duration_seconds").notNull(),
    // M10 Phase 2, lot 3. Without this column, a break is indistinguishable
    // from a focus session once stored — any counter or statistics screen
    // built on this table would count a break as work. `{ enum: [...] }` is
    // TypeScript-only (same as `source` above): it does not emit a CHECK
    // constraint, so the generated migration is hand-edited to add one
    // (same reasoning as migration 0011's `role` column). Existing rows
    // default to 'focus' — every session ever created before this lot was
    // one.
    type: text("type", { enum: ["focus", "shortBreak", "longBreak"] })
      .notNull()
      .default("focus"),
  },
  (table) => [index("idx_pomodoro_sessions_user").on(table.userId, table.startedAt)],
);
