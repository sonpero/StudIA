// End to end through the frozen kernel's own runWorkerTick and a real,
// migrated SqliteJobQueue: proves a terminal split failure ends the job as
// `failed` after one attempt, where any other failure goes back to `pending`
// for a backed-off retry.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { runWorkerTick, SqliteJobQueue, uuidV7Generator, type JobHandler, type SplitJobResult } from "@studia/core";
import { sql } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { openDatabase } from "./db/connection.js";
import { runMigrations } from "./db/migrate.js";
import { recordTerminalFailures, TerminalAwareJobQueue, TerminalFailureRegistry } from "./terminal-failures.js";

const now = new Date("2026-01-01T00:00:00.000Z");

describe("a split job failing through the worker's terminal-aware queue", () => {
  let dir: string | undefined;
  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  async function runOnce(outcome: SplitJobResult) {
    dir = mkdtempSync(path.join(tmpdir(), "studia-worker-"));
    const db = openDatabase(path.join(dir, "studia.db"));
    runMigrations(db);
    db.run(sql`INSERT INTO users (id, username, password_hash, session_version, created_at)
        VALUES ('u1', 'user-u1', 'x', 1, ${now.toISOString()})`);
    const jobQueue = new SqliteJobQueue(db, uuidV7Generator);
    const registry = new TerminalFailureRegistry();
    const handler: JobHandler<{ documentId: string }> = {
      type: "split-notions",
      payloadSchema: z.object({ documentId: z.string() }),
      handle: recordTerminalFailures(registry, () => Promise.resolve(outcome)),
    };
    await jobQueue.enqueue("u1", "split-notions", { documentId: "doc-1" }, now);

    await runWorkerTick({ jobQueue: new TerminalAwareJobQueue(jobQueue, registry), handlers: new Map([[handler.type, handler]]) }, now);

    return jobQueue.listJobs("u1", "split-notions");
  }

  it("goes straight to failed, on its first attempt, when the handler flags the failure terminal", async () => {
    const jobs = await runOnce({ ok: false, error: "Model output truncated", terminal: true });

    expect(jobs).toMatchObject([{ status: "failed", lastError: "Model output truncated" }]);
  });

  it("goes back to pending for a retry when the failure is not terminal", async () => {
    const jobs = await runOnce({ ok: false, error: "overloaded" });

    expect(jobs).toMatchObject([{ status: "pending", lastError: "overloaded" }]);
  });
});
