// In-memory JobQueue test double, mirroring the exact semantics of
// infra/sqlite-job-queue.ts (same attempts/backoff/terminal rules), so
// application-layer tests stay real I/O-free (CLAUDE.md rule 3) without
// duplicating the SQL-specific bits under test in infra/*.int.test.ts.
import { computeBackoffRunAfter } from "../domain/backoff.js";
import type { FailOptions, JobQueue } from "../domain/ports.js";
import type { Job, JobStatus } from "../domain/types.js";

export function fakeJobQueue(seed: Job[] = []): JobQueue & { rows: Job[] } {
  const rows = [...seed];
  let counter = 0;

  return {
    rows,
    enqueue: (userId, type, payload, now) => {
      const id = `job-${String(counter++)}`;
      const nowIso = now.toISOString();
      rows.push({
        id,
        userId,
        type,
        payload,
        status: "pending" satisfies JobStatus,
        attempts: 0,
        maxAttempts: 3,
        lastError: null,
        runAfter: nowIso,
        createdAt: nowIso,
        updatedAt: nowIso,
      });
      return Promise.resolve(id);
    },
    claimNext: (now) => {
      const nowIso = now.toISOString();
      const eligible = rows
        .filter((row) => row.status === "pending" && row.runAfter <= nowIso)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      const job = eligible[0];
      if (!job) return Promise.resolve(null);
      job.status = "running";
      job.updatedAt = nowIso;
      return Promise.resolve({ ...job });
    },
    complete: (jobId, now) => {
      const job = rows.find((row) => row.id === jobId);
      if (job) {
        job.status = "done";
        job.updatedAt = now.toISOString();
      }
      return Promise.resolve();
    },
    fail: (jobId, error, now, options?: FailOptions) => {
      const job = rows.find((row) => row.id === jobId);
      if (!job) return Promise.resolve();
      const nowIso = now.toISOString();
      job.attempts += 1;
      job.lastError = error;
      job.updatedAt = nowIso;
      if (options?.terminal || job.attempts >= job.maxAttempts) {
        job.status = "failed";
      } else {
        job.status = "pending";
        job.runAfter = computeBackoffRunAfter(job.attempts, now);
      }
      return Promise.resolve();
    },
    recoverStale: (now) => {
      let count = 0;
      for (const row of rows) {
        if (row.status === "running") {
          row.status = "pending";
          row.updatedAt = now.toISOString();
          count++;
        }
      }
      return Promise.resolve(count);
    },
    listJobs: (userId, type, createdAfter) =>
      Promise.resolve(
        rows
          .filter((row) => row.userId === userId && row.type === type && (!createdAfter || row.createdAt > createdAfter))
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt)) // newest first, matches SqliteJobQueue
          .map((row) => ({ id: row.id, status: row.status, payload: row.payload, lastError: row.lastError })),
      ),
  };
}
