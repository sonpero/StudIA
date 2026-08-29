import { and, eq } from "drizzle-orm";
import type { drizzle } from "drizzle-orm/better-sqlite3";
import type { TodoRepository } from "../domain/ports.js";
import type { Todo } from "../domain/types.js";
import { todosTable } from "./schema.js";

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
}
