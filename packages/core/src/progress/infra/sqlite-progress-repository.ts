import { and, eq } from "drizzle-orm";
import type { drizzle } from "drizzle-orm/better-sqlite3";
import type { Deadline, ProgressRepository } from "../domain/ports.js";
import type { Availability } from "../domain/types.js";
import { availabilityTable, deadlinesTable, planHistoryTable } from "./schema.js";

export type ProgressDb = ReturnType<typeof drizzle>;

function toDeadline(row: typeof deadlinesTable.$inferSelect): Deadline {
  return { id: row.id, documentId: row.documentId, userId: row.userId, date: row.date, label: row.label, createdAt: row.createdAt };
}

function parseAvailability(minutesJson: string): Availability {
  return JSON.parse(minutesJson) as Availability;
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

  getAvailability(userId: string): Promise<Availability | null> {
    const row = this.db.select().from(availabilityTable).where(eq(availabilityTable.userId, userId)).get();
    return Promise.resolve(row ? parseAvailability(row.minutesJson) : null);
  }

  setAvailability(userId: string, availability: Availability): Promise<void> {
    const minutesJson = JSON.stringify(availability);
    this.db
      .insert(availabilityTable)
      .values({ userId, minutesJson })
      .onConflictDoUpdate({ target: availabilityTable.userId, set: { minutesJson } })
      .run();
    return Promise.resolve();
  }

  getHistory(userId: string): Promise<{ date: string; completed: boolean }[]> {
    const rows = this.db.select().from(planHistoryTable).where(eq(planHistoryTable.userId, userId)).all();
    return Promise.resolve(rows.map((row) => ({ date: row.date, completed: row.completed })));
  }

  markDayCompleted(userId: string, date: string): Promise<void> {
    this.db
      .insert(planHistoryTable)
      .values({ userId, date, completed: true })
      .onConflictDoUpdate({ target: [planHistoryTable.userId, planHistoryTable.date], set: { completed: true } })
      .run();
    return Promise.resolve();
  }
}
