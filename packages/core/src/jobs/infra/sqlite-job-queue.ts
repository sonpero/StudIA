import { and, asc, desc, eq, gt, lte } from "drizzle-orm";
import type { drizzle } from "drizzle-orm/better-sqlite3";
import type { IdGenerator } from "../../shared/index.js";
import { computeBackoffRunAfter } from "../domain/backoff.js";
import type { FailOptions, JobQueue } from "../domain/ports.js";
import type { Job } from "../domain/types.js";
import { jobsTable } from "./schema.js";

export type JobsDb = ReturnType<typeof drizzle>;

function toJob(row: typeof jobsTable.$inferSelect): Job {
  return {
    id: row.id,
    userId: row.userId,
    type: row.type,
    payload: row.payload,
    status: row.status,
    attempts: row.attempts,
    maxAttempts: row.maxAttempts,
    lastError: row.lastError,
    runAfter: row.runAfter,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export class SqliteJobQueue implements JobQueue {
  constructor(
    private readonly db: JobsDb,
    private readonly idGenerator: IdGenerator,
  ) {}

  enqueue(userId: string, type: string, payload: unknown, now: Date): Promise<string> {
    const id = this.idGenerator.next();
    const nowIso = now.toISOString();
    this.db
      .insert(jobsTable)
      .values({
        id,
        userId,
        type,
        payload,
        status: "pending",
        attempts: 0,
        maxAttempts: 3,
        lastError: null,
        runAfter: nowIso,
        createdAt: nowIso,
        updatedAt: nowIso,
      })
      .run();
    return Promise.resolve(id);
  }

  claimNext(now: Date): Promise<Job | null> {
    const nowIso = now.toISOString();
    // Single transaction, no await spanning anything but the DB call itself
    // (docs/modules/jobs.md): better-sqlite3's driver only accepts a
    // synchronous callback here, which enforces exactly that.
    const claimed = this.db.transaction((tx) => {
      const row = tx
        .select()
        .from(jobsTable)
        .where(and(eq(jobsTable.status, "pending"), lte(jobsTable.runAfter, nowIso)))
        .orderBy(asc(jobsTable.createdAt))
        .limit(1)
        .get();
      if (!row) return null;

      tx.update(jobsTable).set({ status: "running", updatedAt: nowIso }).where(eq(jobsTable.id, row.id)).run();
      return { ...row, status: "running" as const, updatedAt: nowIso };
    });

    return Promise.resolve(claimed ? toJob(claimed) : null);
  }

  complete(jobId: string, now: Date): Promise<void> {
    this.db
      .update(jobsTable)
      .set({ status: "done", updatedAt: now.toISOString() })
      .where(eq(jobsTable.id, jobId))
      .run();
    return Promise.resolve();
  }

  // `attempts` is incremented here and ONLY here — never at claim time.
  // Deliberate: claimNext() runs both for a genuine retry AND for startup
  // recovery (recoverStale() also goes running -> pending, without calling
  // this method). If attempts were bumped at claim time instead, a job
  // interrupted twice by a redeploy would accumulate two increments without
  // ever having actually failed, and could reach `failed` after a single
  // real error. Incrementing only in fail() keeps `attempts` meaning
  // exactly "number of recorded failures", matching jobs.md's state
  // machine (`recover` never touches attempts; `retry`/`exhaust` do).
  fail(jobId: string, error: string, now: Date, options?: FailOptions): Promise<void> {
    const nowIso = now.toISOString();
    this.db.transaction((tx) => {
      const row = tx.select().from(jobsTable).where(eq(jobsTable.id, jobId)).get();
      if (!row) return;

      const attempts = row.attempts + 1;
      const terminal = options?.terminal ?? attempts >= row.maxAttempts;

      if (terminal) {
        tx.update(jobsTable)
          .set({ status: "failed", attempts, lastError: error, updatedAt: nowIso })
          .where(eq(jobsTable.id, jobId))
          .run();
      } else {
        tx.update(jobsTable)
          .set({ status: "pending", attempts, lastError: error, runAfter: computeBackoffRunAfter(attempts, now), updatedAt: nowIso })
          .where(eq(jobsTable.id, jobId))
          .run();
      }
    });
    return Promise.resolve();
  }

  recoverStale(now: Date): Promise<number> {
    const result = this.db
      .update(jobsTable)
      .set({ status: "pending", updatedAt: now.toISOString() })
      .where(eq(jobsTable.status, "running"))
      .run();
    return Promise.resolve(result.changes);
  }

  listJobs(userId: string, type: string, createdAfter?: string): Promise<Pick<Job, "id" | "status" | "payload" | "lastError">[]> {
    const conditions = [eq(jobsTable.userId, userId), eq(jobsTable.type, type)];
    if (createdAfter) conditions.push(gt(jobsTable.createdAt, createdAfter));

    const rows = this.db
      .select({ id: jobsTable.id, status: jobsTable.status, payload: jobsTable.payload, lastError: jobsTable.lastError })
      .from(jobsTable)
      .where(and(...conditions))
      // Newest first, matching idx_jobs_user's created_at DESC: callers
      // (e.g. ingestion's getDocument) want the most recent job for a given
      // payload.documentId, not an arbitrary one.
      .orderBy(desc(jobsTable.createdAt))
      .all();
    return Promise.resolve(rows);
  }
}
