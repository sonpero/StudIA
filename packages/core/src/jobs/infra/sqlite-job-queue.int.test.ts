import { sql } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { freshDb, type Db } from "../../../../../tests/support/db.js";
import { SqliteJobQueue } from "./sqlite-job-queue.js";

const now = new Date("2026-01-01T00:00:00.000Z");

// Minimal raw-SQL seed, not an import of identity's repository: jobs/**
// stays fully decoupled from identity even in its own tests, satisfying the
// jobs.user_id -> users(id) FK (`foreign_keys = ON`, see connection.ts)
// with the smallest possible fixture.
function seedUser(db: Db, id: string): void {
  db.run(
    sql`INSERT INTO users (id, username, password_hash, session_version, created_at)
        VALUES (${id}, ${`user-${id}`}, 'x', 1, ${now.toISOString()})`,
  );
}

let idCounter = 0;
const idGenerator = { next: () => `job-${String(idCounter++)}` };

describe("SqliteJobQueue", () => {
  let cleanup: (() => void) | undefined;
  afterEach(() => cleanup?.());

  it("enqueue writes a pending row, readable back via listJobs", async () => {
    const { db, cleanup: c } = freshDb();
    cleanup = c;
    seedUser(db, "u1");
    const queue = new SqliteJobQueue(db, idGenerator);

    const id = await queue.enqueue("u1", "extract-document", { documentId: "d1" }, now);

    expect(await queue.listJobs("u1", "extract-document")).toEqual([
      { id, status: "pending", payload: { documentId: "d1" }, lastError: null },
    ]);
  });

  it("claimNext claims the oldest eligible pending job and flips it to running", async () => {
    const { db, cleanup: c } = freshDb();
    cleanup = c;
    seedUser(db, "u1");
    const queue = new SqliteJobQueue(db, idGenerator);
    const first = await queue.enqueue("u1", "extract-document", { a: 1 }, now);
    await queue.enqueue("u1", "extract-document", { a: 2 }, new Date(now.getTime() + 1000));

    const claimed = await queue.claimNext(new Date(now.getTime() + 2000));

    expect(claimed?.id).toBe(first);
    expect(claimed?.status).toBe("running");
  });

  it("claimNext returns null when nothing is eligible (empty queue, or runAfter in the future)", async () => {
    const { db, cleanup: c } = freshDb();
    cleanup = c;
    seedUser(db, "u1");
    const queue = new SqliteJobQueue(db, idGenerator);

    expect(await queue.claimNext(now)).toBeNull();

    await queue.enqueue("u1", "extract-document", {}, new Date(now.getTime() + 60_000));
    expect(await queue.claimNext(now)).toBeNull();
  });

  it("complete() sets status to done", async () => {
    const { db, cleanup: c } = freshDb();
    cleanup = c;
    seedUser(db, "u1");
    const queue = new SqliteJobQueue(db, idGenerator);
    const id = await queue.enqueue("u1", "extract-document", {}, now);
    await queue.claimNext(now);

    await queue.complete(id, now);

    expect((await queue.listJobs("u1", "extract-document"))[0]?.status).toBe("done");
  });

  it("fail() retries with backoff while attempts < maxAttempts, then ends failed with lastError populated on the 3rd failure", async () => {
    const { db, cleanup: c } = freshDb();
    cleanup = c;
    seedUser(db, "u1");
    const queue = new SqliteJobQueue(db, idGenerator);
    const id = await queue.enqueue("u1", "extract-document", {}, now);

    await queue.claimNext(now);
    await queue.fail(id, "error 1", now);
    let [job] = await queue.listJobs("u1", "extract-document");
    expect(job).toMatchObject({ status: "pending", lastError: "error 1" });

    await queue.claimNext(new Date(now.getTime() + 120_000));
    await queue.fail(id, "error 2", now);
    [job] = await queue.listJobs("u1", "extract-document");
    expect(job).toMatchObject({ status: "pending", lastError: "error 2" });

    await queue.claimNext(new Date(now.getTime() + 300_000));
    await queue.fail(id, "error 3", now);
    [job] = await queue.listJobs("u1", "extract-document");
    expect(job).toMatchObject({ status: "failed", lastError: "error 3" });
  });

  it("fail(..., { terminal: true }) goes straight to failed on the very first failure", async () => {
    const { db, cleanup: c } = freshDb();
    cleanup = c;
    seedUser(db, "u1");
    const queue = new SqliteJobQueue(db, idGenerator);
    const id = await queue.enqueue("u1", "unregistered-type", {}, now);
    await queue.claimNext(now);

    await queue.fail(id, 'No handler registered for job type "unregistered-type"', now, { terminal: true });

    expect((await queue.listJobs("u1", "unregistered-type"))[0]).toMatchObject({
      status: "failed",
      lastError: 'No handler registered for job type "unregistered-type"',
    });
  });

  it("recoverStale resets running rows to pending, leaves done and failed untouched, and returns the count", async () => {
    const { db, cleanup: c } = freshDb();
    cleanup = c;
    seedUser(db, "u1");
    const queue = new SqliteJobQueue(db, idGenerator);
    const running = await queue.enqueue("u1", "extract-document", {}, now);
    const done = await queue.enqueue("u1", "extract-document", {}, now);
    const failed = await queue.enqueue("u1", "extract-document", {}, now);
    await queue.claimNext(now); // claims `running`
    await queue.claimNext(now); // claims `done`
    await queue.complete(done, now);
    await queue.claimNext(now); // claims `failed`
    await queue.fail(failed, "boom", now, { terminal: true });

    const count = await queue.recoverStale(now);

    expect(count).toBe(1);
    const jobs = await queue.listJobs("u1", "extract-document");
    expect(jobs.find((j) => j.id === running)?.status).toBe("pending");
    expect(jobs.find((j) => j.id === done)?.status).toBe("done");
    expect(jobs.find((j) => j.id === failed)?.status).toBe("failed");
  });

  it("listJobs filters by userId and type, and honours createdAfter", async () => {
    const { db, cleanup: c } = freshDb();
    cleanup = c;
    seedUser(db, "u1");
    seedUser(db, "u2");
    const queue = new SqliteJobQueue(db, idGenerator);
    await queue.enqueue("u1", "extract-document", {}, now);
    await queue.enqueue("u1", "other-type", {}, now);
    await queue.enqueue("u2", "extract-document", {}, now);
    const later = await queue.enqueue("u1", "extract-document", {}, new Date(now.getTime() + 60_000));

    const jobs = await queue.listJobs("u1", "extract-document", new Date(now.getTime() + 30_000).toISOString());

    expect(jobs).toEqual([{ id: later, status: "pending", payload: {}, lastError: null }]);
  });

  it("listJobs returns newest first, matching the idx_jobs_user index order", async () => {
    const { db, cleanup: c } = freshDb();
    cleanup = c;
    seedUser(db, "u1");
    const queue = new SqliteJobQueue(db, idGenerator);
    const first = await queue.enqueue("u1", "extract-document", {}, now);
    const second = await queue.enqueue("u1", "extract-document", {}, new Date(now.getTime() + 1000));
    const third = await queue.enqueue("u1", "extract-document", {}, new Date(now.getTime() + 2000));

    const jobs = await queue.listJobs("u1", "extract-document");

    expect(jobs.map((j) => j.id)).toEqual([third, second, first]);
  });

  it("rejects a job for a user that does not exist (FK enforced)", () => {
    const { db, cleanup: c } = freshDb();
    cleanup = c;
    const queue = new SqliteJobQueue(db, idGenerator);

    expect(() => queue.enqueue("ghost-user", "extract-document", {}, now)).toThrow(/FOREIGN KEY/);
  });
});
