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
  },
  (table) => [index("idx_pomodoro_sessions_user").on(table.userId, table.startedAt)],
);
