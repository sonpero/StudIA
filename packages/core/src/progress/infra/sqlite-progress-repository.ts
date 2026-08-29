import { and, eq } from "drizzle-orm";
import type { drizzle } from "drizzle-orm/better-sqlite3";
import type { Deadline, ProgressRepository } from "../domain/ports.js";
import { deadlinesTable } from "./schema.js";

export type ProgressDb = ReturnType<typeof drizzle>;

function toDeadline(row: typeof deadlinesTable.$inferSelect): Deadline {
  return { id: row.id, documentId: row.documentId, userId: row.userId, date: row.date, label: row.label, createdAt: row.createdAt };
}

export class SqliteProgressRepository implements ProgressRepository {
  constructor(private readonly db: ProgressDb) {}

  getDeadline(userId: string, documentId: string): Promise<Deadline | null> {
    const row = this.db
      .select()
      .from(deadlinesTable)
      .where(and(eq(deadlinesTable.userId, userId), eq(deadlinesTable.documentId, documentId)))
      .get();
    return Promise.resolve(row ? toDeadline(row) : null);
  }

  setDeadline(userId: string, deadline: Deadline): Promise<void> {
    this.db
      .insert(deadlinesTable)
      .values({ id: deadline.id, documentId: deadline.documentId, userId, date: deadline.date, label: deadline.label, createdAt: deadline.createdAt })
      .onConflictDoUpdate({
        target: deadlinesTable.documentId,
        set: { date: deadline.date, label: deadline.label, createdAt: deadline.createdAt },
      })
      .run();
    return Promise.resolve();
  }

  deleteDeadline(userId: string, documentId: string): Promise<void> {
    this.db.delete(deadlinesTable).where(and(eq(deadlinesTable.userId, userId), eq(deadlinesTable.documentId, documentId))).run();
    return Promise.resolve();
  }

  getDeadlinesForUser(userId: string): Promise<Deadline[]> {
    const rows = this.db.select().from(deadlinesTable).where(eq(deadlinesTable.userId, userId)).all();
    return Promise.resolve(rows.map(toDeadline));
  }
}
