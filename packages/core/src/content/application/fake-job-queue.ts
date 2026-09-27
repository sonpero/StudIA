// A minimal local JobQueue fake for content's own use-case tests, rather
// than importing jobs' internal application/fakes.ts: that file is not part
// of jobs/index.ts's public surface (same reasoning as ingestion's
// fakeJobQueueForIngestion). Kept in its own file, not content's fakes.ts,
// so this addition stays independent of that file's other doubles.
import type { Job, JobQueue } from "../../jobs/index.js";

export function fakeJobQueueForContent(seed: Job[] = []): JobQueue & { rows: Job[] } {
  const rows = [...seed];
  let counter = 0;
  return {
    rows,
    enqueue: (userId, type, payload, now) => {
      const id = `job-new-${String(counter++)}`;
      const nowIso = now.toISOString();
      rows.push({
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
      });
      return Promise.resolve(id);
    },
    claimNext: () => Promise.resolve(null),
    complete: () => Promise.resolve(),
    fail: () => Promise.resolve(),
    recoverStale: () => Promise.resolve(0),
    listJobs: (userId, type, createdAfter) =>
      Promise.resolve(
        rows
          .filter((row) => row.userId === userId && row.type === type && (!createdAfter || row.createdAt > createdAfter))
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt)) // newest first, matches SqliteJobQueue
          .map((row) => ({ id: row.id, status: row.status, payload: row.payload, lastError: row.lastError })),
      ),
  };
}

export function aSplitJob(overrides: Partial<Job> = {}): Job {
  const at = "2026-01-01T00:00:00.000Z";
  return {
    id: "split-1",
    userId: "u1",
    type: "split-notions",
    payload: { documentId: "doc-1" },
    status: "failed",
    attempts: 3,
    maxAttempts: 3,
    lastError: "Splitting produced 3 notions, expected 5 to 60",
    runAfter: at,
    createdAt: at,
    updatedAt: at,
    ...overrides,
  };
}
