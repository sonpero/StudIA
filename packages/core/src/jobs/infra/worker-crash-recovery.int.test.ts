import { sql } from "drizzle-orm";
import { z } from "zod";
import { describe, expect, it, vi } from "vitest";
import { ok } from "../../shared/index.js";
import { runWorkerTick } from "../application/run-worker-tick.js";
import type { JobHandler } from "../domain/ports.js";
import { freshDb, type Db } from "../../../../../tests/support/db.js";
import { SqliteJobQueue } from "./sqlite-job-queue.js";

const now = new Date("2026-01-01T00:00:00.000Z");

function seedUser(db: Db, id: string): void {
  db.run(
    sql`INSERT INTO users (id, username, password_hash, session_version, created_at)
        VALUES (${id}, ${`user-${id}`}, 'x', 1, ${now.toISOString()})`,
  );
}

const idGenerator = { next: () => "job-0" };

// docs/modules/jobs.md: "Kill the worker mid-handler, restart it, the job
// runs again and exactly one set of rows exists. This is the M2 acceptance
// criterion and the reason handlers must be idempotent." This is that test.
describe("worker crash recovery", () => {
  it("re-running a job after a simulated crash produces the handler's idempotent side effect exactly once, not twice", async () => {
    const { db, cleanup } = freshDb();
    try {
      seedUser(db, "u1");
      const queue = new SqliteJobQueue(db, idGenerator);
      const jobId = await queue.enqueue("u1", "extract-document", { documentId: "d1" }, now);

      // Simulates the real extraction handler's idempotency rule from
      // ingestion.md: "deletes any existing extraction row for the document
      // before inserting". A plain Map.set is naturally the same shape.
      const extractionsByDocument = new Map<string, string>();
      const handle = vi.fn().mockImplementation((payload: { documentId: string }) => {
        extractionsByDocument.set(payload.documentId, `markdown for ${payload.documentId}`);
        return Promise.resolve(ok(undefined));
      });
      const handler: JobHandler<{ documentId: string }> = {
        type: "extract-document",
        payloadSchema: z.object({ documentId: z.string() }),
        handle,
      };

      // 1. Worker picks up the job and starts the handler...
      const claimed = await queue.claimNext(now);
      expect(claimed?.id).toBe(jobId);
      await handler.handle({ documentId: "d1" }, { jobId, userId: "u1", attempt: 1, now });
      // ...and the process dies right here: no complete()/fail() call ever
      // happens. The job row is stuck in `running`.
      expect(extractionsByDocument.get("d1")).toBe("markdown for d1");

      // 2. Worker restarts: recoverStale runs once at startup.
      const recovered = await queue.recoverStale(now);
      expect(recovered).toBe(1);

      // 3. The job is claimable again and gets dispatched for real this time.
      const outcome = await runWorkerTick({ jobQueue: queue, handlers: new Map([["extract-document", handler]]) }, now);
      expect(outcome).toBe("claimed");

      // The handler really did run twice (once "lost" to the crash, once for real)...
      expect(handle).toHaveBeenCalledTimes(2);
      // ...but its idempotent side effect exists exactly once, not duplicated.
      expect(extractionsByDocument.size).toBe(1);
      expect(extractionsByDocument.get("d1")).toBe("markdown for d1");

      // And exactly one job row exists for it, ending done.
      const jobs = await queue.listJobs("u1", "extract-document");
      expect(jobs).toHaveLength(1);
      expect(jobs[0]).toMatchObject({ id: jobId, status: "done" });
    } finally {
      cleanup();
    }
  });
});
