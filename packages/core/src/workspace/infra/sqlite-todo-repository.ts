import { and, asc, desc, eq, gte, isNull, lte } from "drizzle-orm";
import type { drizzle } from "drizzle-orm/better-sqlite3";
import type { TodoRepository } from "../domain/ports.js";
import type { PomodoroSession, Todo, TodoProposal } from "../domain/types.js";
import { pomodoroSessionsTable, todoProposalsTable, todosTable } from "./schema.js";

export type WorkspaceDb = ReturnType<typeof drizzle>;

function toTodo(row: typeof todosTable.$inferSelect): Todo {
  return {
    id: row.id,
    userId: row.userId,
    label: row.label,
    dueDate: row.dueDate,
    documentId: row.documentId,
    done: row.done,
    source: row.source,
    createdAt: row.createdAt,
  };
}

function toProposal(row: typeof todoProposalsTable.$inferSelect): TodoProposal {
  return {
    id: row.id,
    jobId: row.jobId,
    userId: row.userId,
    label: row.label,
    dueDate: row.dueDate,
    subjectHint: row.subjectHint,
    createdAt: row.createdAt,
  };
}

function toPomodoroSession(row: typeof pomodoroSessionsTable.$inferSelect): PomodoroSession {
  return {
    id: row.id,
    userId: row.userId,
    todoId: row.todoId,
    startedAt: row.startedAt,
    endedAt: row.endedAt,
    durationSeconds: row.durationSeconds,
  };
}

export class SqliteTodoRepository implements TodoRepository {
  constructor(private readonly db: WorkspaceDb) {}

  createTodo(todo: Todo): Promise<void> {
    this.db.insert(todosTable).values(todo).run();
    return Promise.resolve();
  }

  listTodos(userId: string): Promise<Todo[]> {
    const rows = this.db.select().from(todosTable).where(eq(todosTable.userId, userId)).orderBy(todosTable.createdAt).all();
    return Promise.resolve(rows.map(toTodo));
  }

  // Both bounds inclusive. gte/lte against a NULL dueDate each evaluate to
  // NULL, not true, so a date-less todo is excluded without a separate
  // IS NOT NULL check — see docs/modules/workspace.md's Calendar section
  // for why that exclusion is a decision, not just this operator's
  // behaviour, and the int test that pins it down independently of SQL's
  // own NULL semantics.
  getTodosForUserInRange(userId: string, start: string, end: string): Promise<Todo[]> {
    const rows = this.db
      .select()
      .from(todosTable)
      .where(and(eq(todosTable.userId, userId), gte(todosTable.dueDate, start), lte(todosTable.dueDate, end)))
      .orderBy(asc(todosTable.dueDate), asc(todosTable.createdAt))
      .all();
    return Promise.resolve(rows.map(toTodo));
  }

  updateTodo(userId: string, id: string, patch: Partial<Pick<Todo, "label" | "dueDate" | "documentId" | "done">>): Promise<Todo | null> {
    const owned = this.db
      .select()
      .from(todosTable)
      .where(and(eq(todosTable.id, id), eq(todosTable.userId, userId)))
      .get();
    if (!owned) return Promise.resolve(null);

    this.db.update(todosTable).set(patch).where(and(eq(todosTable.id, id), eq(todosTable.userId, userId))).run();
    const updated = this.db
      .select()
      .from(todosTable)
      .where(and(eq(todosTable.id, id), eq(todosTable.userId, userId)))
      .get();
    return Promise.resolve(updated ? toTodo(updated) : null);
  }

  deleteTodo(userId: string, id: string): Promise<boolean> {
    const owned = this.db
      .select()
      .from(todosTable)
      .where(and(eq(todosTable.id, id), eq(todosTable.userId, userId)))
      .get();
    if (!owned) return Promise.resolve(false);

    this.db.delete(todosTable).where(and(eq(todosTable.id, id), eq(todosTable.userId, userId))).run();
    return Promise.resolve(true);
  }

  // Delete-then-insert in one transaction: idempotence for a job retried
  // after a worker crash (same discipline as content's
  // replaceNotionsForDocument and ingestion's upsertExtraction).
  replaceProposalsForJob(userId: string, jobId: string, proposals: TodoProposal[]): Promise<void> {
    this.db.transaction((tx) => {
      tx.delete(todoProposalsTable).where(and(eq(todoProposalsTable.jobId, jobId), eq(todoProposalsTable.userId, userId))).run();
      for (const proposal of proposals) {
        tx.insert(todoProposalsTable).values(proposal).run();
      }
    });
    return Promise.resolve();
  }

  listProposals(userId: string, jobId: string): Promise<TodoProposal[]> {
    const rows = this.db
      .select()
      .from(todoProposalsTable)
      .where(and(eq(todoProposalsTable.jobId, jobId), eq(todoProposalsTable.userId, userId)))
      .all();
    return Promise.resolve(rows.map(toProposal));
  }

  // The central invariant (docs/modules/workspace.md): every accepted
  // proposal becomes a Todo and every proposal for the job is deleted
  // (accepted or not), together, in one transaction — never two separate
  // calls that could leave one done without the other.
  confirmProposals(userId: string, jobId: string, todos: Todo[]): Promise<void> {
    this.db.transaction((tx) => {
      for (const todo of todos) {
        tx.insert(todosTable).values(todo).run();
      }
      tx.delete(todoProposalsTable).where(and(eq(todoProposalsTable.jobId, jobId), eq(todoProposalsTable.userId, userId))).run();
    });
    return Promise.resolve();
  }

  deleteProposals(userId: string, jobId: string): Promise<void> {
    this.db.delete(todoProposalsTable).where(and(eq(todoProposalsTable.jobId, jobId), eq(todoProposalsTable.userId, userId))).run();
    return Promise.resolve();
  }

  createPomodoroSession(session: PomodoroSession): Promise<void> {
    this.db.insert(pomodoroSessionsTable).values(session).run();
    return Promise.resolve();
  }

  endPomodoroSession(userId: string, id: string, endedAt: string): Promise<PomodoroSession | null> {
    const owned = this.db
      .select()
      .from(pomodoroSessionsTable)
      .where(and(eq(pomodoroSessionsTable.id, id), eq(pomodoroSessionsTable.userId, userId)))
      .get();
    if (!owned) return Promise.resolve(null);

    this.db.update(pomodoroSessionsTable).set({ endedAt }).where(and(eq(pomodoroSessionsTable.id, id), eq(pomodoroSessionsTable.userId, userId))).run();
    return Promise.resolve(toPomodoroSession({ ...owned, endedAt }));
  }

  // Most recently *started* row with endedAt still null — see this
  // module's own "Pomodoro (M7)" note for why "latest" is startedAt, not
  // insertion order, and why an elapsed-but-unended row is still a valid
  // candidate here (isPomodoroActive decides whether it still counts).
  getLatestOpenPomodoroSession(userId: string): Promise<PomodoroSession | null> {
    const row = this.db
      .select()
      .from(pomodoroSessionsTable)
      .where(and(eq(pomodoroSessionsTable.userId, userId), isNull(pomodoroSessionsTable.endedAt)))
      .orderBy(desc(pomodoroSessionsTable.startedAt))
      .limit(1)
      .get();
    return Promise.resolve(row ? toPomodoroSession(row) : null);
  }
}
