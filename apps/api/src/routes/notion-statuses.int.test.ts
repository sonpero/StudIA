import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Argon2PasswordHasher, createOrResetAccount, SqliteUserRepository, uuidV7Generator } from "@studia/core";
import { sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../app.js";
import { openDatabase, type Db } from "../db/connection.js";
import { runMigrations } from "../db/migrate.js";

function extractCookie(setCookieHeader: string | string[] | undefined): string {
  const raw = Array.isArray(setCookieHeader) ? setCookieHeader[0] : setCookieHeader;
  if (!raw) throw new Error("expected a Set-Cookie header");
  const match = /^([^=]+)=([^;]+)/.exec(raw);
  if (!match) throw new Error(`could not parse Set-Cookie header: ${raw}`);
  return `${match[1]}=${match[2]}`;
}

const now = new Date("2026-01-01T00:00:00.000Z");
const SPLIT_ERROR = "Splitting produced 3 notions, expected 5 to 60";

// The notion step's own status and its retry (docs/modules/content.md's
// "Notion step status and retry"): served by content from the latest
// split-notions job per document, never from its error text.
describe("notion step status and retry routes", () => {
  let dir: string;
  let seedDb: Db;
  let app: ReturnType<typeof buildApp>;
  let aliceCookie: string;
  let bobCookie: string;

  function insertSplitJob(id: string, documentId: string, status: "pending" | "running" | "done" | "failed", createdAt: string) {
    seedDb.run(sql`INSERT INTO jobs (id, user_id, type, payload_json, status, attempts, max_attempts, last_error, run_after, created_at, updated_at)
        VALUES (${id}, (SELECT id FROM users WHERE username='alice'), 'split-notions', ${JSON.stringify({ documentId })}, ${status}, 3, 3,
                ${status === "failed" ? SPLIT_ERROR : null}, ${createdAt}, ${createdAt}, ${createdAt})`);
  }

  beforeEach(async () => {
    dir = mkdtempSync(path.join(tmpdir(), "studia-api-notion-statuses-"));
    const dbPath = path.join(dir, "test.db");
    seedDb = openDatabase(dbPath);
    runMigrations(seedDb);
    const identityDeps = { userRepository: new SqliteUserRepository(seedDb), passwordHasher: new Argon2PasswordHasher(), idGenerator: uuidV7Generator };
    await createOrResetAccount(identityDeps, "alice", "alice-pass", now);
    await createOrResetAccount(identityDeps, "bob", "bob-pass", now);

    for (const id of ["doc-failed", "doc-running", "doc-done"]) {
      seedDb.run(sql`INSERT INTO documents (id, user_id, title, source_type, status, colour, created_at)
          VALUES (${id}, (SELECT id FROM users WHERE username='alice'), ${id}, 'pdf', 'done', '#F87171', ${now.toISOString()})`);
    }
    insertSplitJob("s-failed", "doc-failed", "failed", "2026-01-01T00:00:01.000Z");
    // An older failed attempt superseded by a newer running one: the newest wins.
    insertSplitJob("s-old", "doc-running", "failed", "2026-01-01T00:00:01.000Z");
    insertSplitJob("s-running", "doc-running", "running", "2026-01-01T00:00:02.000Z");
    insertSplitJob("s-done", "doc-done", "done", "2026-01-01T00:00:01.000Z");

    app = buildApp({ databasePath: dbPath, dataDir: dir, sessionSecret: "test-session-secret", cookieSecure: false, llmAdapter: "fixture" });
    const aliceLogin = await app.inject({ method: "POST", url: "/api/auth/login", payload: { username: "alice", password: "alice-pass" } });
    aliceCookie = extractCookie(aliceLogin.headers["set-cookie"]);
    const bobLogin = await app.inject({ method: "POST", url: "/api/auth/login", payload: { username: "bob", password: "bob-pass" } });
    bobCookie = extractCookie(bobLogin.headers["set-cookie"]);
  });

  afterEach(async () => {
    await app.close();
    rmSync(dir, { recursive: true, force: true });
  });

  function splitJobsFor(documentId: string): { status: string }[] {
    return seedDb.all<{ status: string }>(
      sql`SELECT status FROM jobs WHERE type = 'split-notions' AND json_extract(payload_json, '$.documentId') = ${documentId} ORDER BY created_at`,
    );
  }

  it("GET /api/notions/statuses lists every document's notion-step status from its latest split job", async () => {
    const res = await app.inject({ method: "GET", url: "/api/notions/statuses", headers: { cookie: aliceCookie } });

    expect(res.statusCode).toBe(200);
    const body = res.json<{ documentId: string; status: string }[]>();
    expect([...body].sort((a, b) => a.documentId.localeCompare(b.documentId))).toEqual([
      { documentId: "doc-done", status: "ready" },
      { documentId: "doc-failed", status: "failed" },
      { documentId: "doc-running", status: "pending" },
    ]);
  });

  it("GET /api/notions/statuses never sends the job's error text", async () => {
    const res = await app.inject({ method: "GET", url: "/api/notions/statuses", headers: { cookie: aliceCookie } });

    expect(res.body).not.toContain("expected 5 to 60");
    expect(res.body).not.toContain("lastError");
  });

  it("GET /api/notions/statuses requires authentication (401)", async () => {
    const res = await app.inject({ method: "GET", url: "/api/notions/statuses" });
    expect(res.statusCode).toBe(401);
  });

  it("GET /api/notions/statuses is scoped: another user sees none of alice's documents", async () => {
    const res = await app.inject({ method: "GET", url: "/api/notions/statuses", headers: { cookie: bobCookie } });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([]);
  });

  it("POST /api/documents/:id/notions/retry re-enqueues only the split job of a failed notion step (202)", async () => {
    const res = await app.inject({ method: "POST", url: "/api/documents/doc-failed/notions/retry", headers: { cookie: aliceCookie } });

    expect(res.statusCode).toBe(202);
    expect(splitJobsFor("doc-failed").map((j) => j.status)).toEqual(["failed", "pending"]);
    const extractJobs = seedDb.all(sql`SELECT id FROM jobs WHERE type = 'extract-document'`);
    expect(extractJobs).toEqual([]);

    const statuses = await app.inject({ method: "GET", url: "/api/notions/statuses", headers: { cookie: aliceCookie } });
    expect(statuses.json<{ documentId: string; status: string }[]>().find((s) => s.documentId === "doc-failed")?.status).toBe("pending");
  });

  it("POST .../notions/retry is refused when the notion step has not failed (409)", async () => {
    const running = await app.inject({ method: "POST", url: "/api/documents/doc-running/notions/retry", headers: { cookie: aliceCookie } });
    const done = await app.inject({ method: "POST", url: "/api/documents/doc-done/notions/retry", headers: { cookie: aliceCookie } });

    expect(running.statusCode).toBe(409);
    expect(done.statusCode).toBe(409);
    expect(splitJobsFor("doc-running")).toHaveLength(2);
    expect(splitJobsFor("doc-done")).toHaveLength(1);
  });

  it("POST .../notions/retry is refused when the document already has notions, even after a failed split (409)", async () => {
    seedDb.run(sql`INSERT INTO notions (id, document_id, user_id, title, body, difficulty, position, created_at)
        VALUES ('n1', 'doc-failed', (SELECT id FROM users WHERE username='alice'), 'Notion', 'Corps.', 'medium', 0, ${now.toISOString()})`);

    const res = await app.inject({ method: "POST", url: "/api/documents/doc-failed/notions/retry", headers: { cookie: aliceCookie } });

    expect(res.statusCode).toBe(409);
    expect(res.json()).toEqual({ error: "has-notions" });
    expect(splitJobsFor("doc-failed")).toHaveLength(1);
  });

  it("POST .../notions/retry requires authentication (401)", async () => {
    const res = await app.inject({ method: "POST", url: "/api/documents/doc-failed/notions/retry" });
    expect(res.statusCode).toBe(401);
  });

  it("POST .../notions/retry on another user's document is refused (403) and enqueues nothing", async () => {
    const res = await app.inject({ method: "POST", url: "/api/documents/doc-failed/notions/retry", headers: { cookie: bobCookie } });

    expect(res.statusCode).toBe(403);
    expect(splitJobsFor("doc-failed")).toHaveLength(1);
  });

  it("POST .../notions/retry on an unknown document is refused (403)", async () => {
    const res = await app.inject({ method: "POST", url: "/api/documents/no-such-doc/notions/retry", headers: { cookie: aliceCookie } });
    expect(res.statusCode).toBe(403);
  });
});
