import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Argon2PasswordHasher, createOrResetAccount, SqliteUserRepository, uuidV7Generator } from "@studia/core";
import { sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../app.js";
import { openDatabase } from "../db/connection.js";
import { runMigrations } from "../db/migrate.js";

function extractCookie(setCookieHeader: string | string[] | undefined): string {
  const raw = Array.isArray(setCookieHeader) ? setCookieHeader[0] : setCookieHeader;
  if (!raw) throw new Error("expected a Set-Cookie header");
  const match = /^([^=]+)=([^;]+)/.exec(raw);
  if (!match) throw new Error(`could not parse Set-Cookie header: ${raw}`);
  return `${match[1]}=${match[2]}`;
}

const now = new Date("2026-01-01T00:00:00.000Z");

// today is client-computed and required (docs/modules/progress.md): the
// server never guesses it. UTC is fine here since these tests don't
// exercise timezone-correctness itself (day-boundary.unit.test.ts does).
function todayParam(): string {
  return `today=${new Date().toISOString().slice(0, 10)}`;
}

function farFutureDeadline(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 30);
  return d.toISOString().slice(0, 10);
}

describe("progress routes", () => {
  let dir: string;
  let dbPath: string;
  let app: ReturnType<typeof buildApp>;
  let aliceCookie: string;
  let bobCookie: string;

  beforeEach(async () => {
    dir = mkdtempSync(path.join(tmpdir(), "studia-api-progress-"));
    dbPath = path.join(dir, "test.db");
    const seedDb = openDatabase(dbPath);
    runMigrations(seedDb);
    const identityDeps = { userRepository: new SqliteUserRepository(seedDb), passwordHasher: new Argon2PasswordHasher(), idGenerator: uuidV7Generator };
    await createOrResetAccount(identityDeps, "alice", "alice-pass", now);
    await createOrResetAccount(identityDeps, "bob", "bob-pass", now);

    seedDb.run(sql`INSERT INTO documents (id, user_id, title, source_type, status, colour, created_at)
        VALUES ('doc-1', (SELECT id FROM users WHERE username='alice'), 'Cours', 'photo', 'done', '#F87171', ${now.toISOString()})`);
    seedDb.run(sql`INSERT INTO notions (id, document_id, user_id, title, body, difficulty, position, created_at)
        VALUES ('n1', 'doc-1', (SELECT id FROM users WHERE username='alice'), 'Notion', 'Corps.', 'easy', 0, ${now.toISOString()})`);
    seedDb.run(sql`INSERT INTO cards (id, notion_id, user_id, type, state, question, answer, options_json, created_at)
        VALUES ('c1', 'n1', (SELECT id FROM users WHERE username='alice'), 'flashcard', 'active', 'Question ?', 'Réponse', NULL, ${now.toISOString()})`);

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

  describe("POST /api/documents/:id/deadline", () => {
    it("sets a deadline (204)", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/documents/doc-1/deadline",
        headers: { cookie: aliceCookie },
        payload: { date: farFutureDeadline(), label: "Contrôle" },
      });
      expect(res.statusCode).toBe(204);
    });

    it("requires authentication (401)", async () => {
      const res = await app.inject({ method: "POST", url: "/api/documents/doc-1/deadline", payload: { date: farFutureDeadline() } });
      expect(res.statusCode).toBe(401);
    });

    it("rejects another user's document (403)", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/documents/doc-1/deadline",
        headers: { cookie: bobCookie },
        payload: { date: farFutureDeadline() },
      });
      expect(res.statusCode).toBe(403);
      expect(res.json()).toEqual({ error: "not-found" });
    });

    it("rejects a malformed body (400)", async () => {
      const res = await app.inject({ method: "POST", url: "/api/documents/doc-1/deadline", headers: { cookie: aliceCookie }, payload: {} });
      expect(res.statusCode).toBe(400);
    });
  });

  describe("DELETE /api/documents/:id/deadline", () => {
    it("removes it (204)", async () => {
      await app.inject({ method: "POST", url: "/api/documents/doc-1/deadline", headers: { cookie: aliceCookie }, payload: { date: farFutureDeadline() } });
      const res = await app.inject({ method: "DELETE", url: "/api/documents/doc-1/deadline", headers: { cookie: aliceCookie } });
      expect(res.statusCode).toBe(204);
    });

    it("requires authentication (401)", async () => {
      const res = await app.inject({ method: "DELETE", url: "/api/documents/doc-1/deadline" });
      expect(res.statusCode).toBe(401);
    });

    it("rejects another user's document (403)", async () => {
      const res = await app.inject({ method: "DELETE", url: "/api/documents/doc-1/deadline", headers: { cookie: bobCookie } });
      expect(res.statusCode).toBe(403);
      expect(res.json()).toEqual({ error: "not-found" });
    });
  });

  describe("GET /api/documents/:id/deadline", () => {
    it("returns the stored value (200)", async () => {
      await app.inject({ method: "POST", url: "/api/documents/doc-1/deadline", headers: { cookie: aliceCookie }, payload: { date: farFutureDeadline(), label: "Contrôle" } });
      const res = await app.inject({ method: "GET", url: "/api/documents/doc-1/deadline", headers: { cookie: aliceCookie } });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ date: farFutureDeadline(), label: "Contrôle" });
    });

    it("returns 404 { error: 'no-deadline' } when none is set — a different body from the 403 ownership case", async () => {
      const res = await app.inject({ method: "GET", url: "/api/documents/doc-1/deadline", headers: { cookie: aliceCookie } });
      expect(res.statusCode).toBe(404);
      expect(res.json()).toEqual({ error: "no-deadline" });
    });

    it("requires authentication (401)", async () => {
      const res = await app.inject({ method: "GET", url: "/api/documents/doc-1/deadline" });
      expect(res.statusCode).toBe(401);
    });

    it("rejects another user's document (403), a distinct body from the 404 no-deadline case", async () => {
      const res = await app.inject({ method: "GET", url: "/api/documents/doc-1/deadline", headers: { cookie: bobCookie } });
      expect(res.statusCode).toBe(403);
      expect(res.json()).toEqual({ error: "not-found" });
    });
  });

  describe("GET /api/documents/:id/course-progress", () => {
    it("returns 200 with title, deadline, and progress once a card has been reviewed", async () => {
      await app.inject({ method: "POST", url: "/api/documents/doc-1/deadline", headers: { cookie: aliceCookie }, payload: { date: farFutureDeadline(), label: "Contrôle" } });
      const seedDb = openDatabase(dbPath);
      seedDb.run(sql`INSERT INTO card_schedules (card_id, user_id, due, stability, difficulty, reps, lapses, last_reviewed_at)
          VALUES ('c1', (SELECT id FROM users WHERE username='alice'), ${now.toISOString()}, 20, 3, 2, 0, ${now.toISOString()})`);

      const res = await app.inject({ method: "GET", url: `/api/documents/doc-1/course-progress?${todayParam()}`, headers: { cookie: aliceCookie } });

      expect(res.statusCode).toBe(200);
      const body = res.json<{ title: string; deadlineDate: string; deadlineLabel: string; kind: string; progress: { coverage: number } }>();
      expect(body.title).toBe("Cours");
      expect(body.deadlineDate).toBe(farFutureDeadline());
      expect(body.deadlineLabel).toBe("Contrôle");
      expect(body.kind).toBe("ok");
      expect(body.progress.coverage).toBe(1);
    });

    it("returns 422 with the same title/deadline shape when the deadline is in the past", async () => {
      const pastDate = "2020-01-01";
      const seedDb = openDatabase(dbPath);
      seedDb.run(sql`INSERT INTO deadlines (id, document_id, user_id, date, label, created_at)
          VALUES ('d1', 'doc-1', (SELECT id FROM users WHERE username='alice'), ${pastDate}, 'Ancien contrôle', ${now.toISOString()})`);

      const res = await app.inject({ method: "GET", url: `/api/documents/doc-1/course-progress?${todayParam()}`, headers: { cookie: aliceCookie } });

      expect(res.statusCode).toBe(422);
      expect(res.json()).toEqual({ title: "Cours", deadlineDate: pastDate, deadlineLabel: "Ancien contrôle", kind: "error", error: "deadline-in-past" });
    });

    it("rejects a missing or invalid today (400)", async () => {
      const missing = await app.inject({ method: "GET", url: "/api/documents/doc-1/course-progress", headers: { cookie: aliceCookie } });
      expect(missing.statusCode).toBe(400);

      const invalid = await app.inject({ method: "GET", url: "/api/documents/doc-1/course-progress?today=not-a-date", headers: { cookie: aliceCookie } });
      expect(invalid.statusCode).toBe(400);
    });

    it("requires authentication (401)", async () => {
      const res = await app.inject({ method: "GET", url: `/api/documents/doc-1/course-progress?${todayParam()}` });
      expect(res.statusCode).toBe(401);
    });

    it("rejects another user's document (403)", async () => {
      const res = await app.inject({ method: "GET", url: `/api/documents/doc-1/course-progress?${todayParam()}`, headers: { cookie: bobCookie } });
      expect(res.statusCode).toBe(403);
      expect(res.json()).toEqual({ error: "not-found" });
    });
  });

  describe("GET /api/course-progress", () => {
    it("aggregates every one of the caller's documents, scoped to them", async () => {
      const seedDb = openDatabase(dbPath);
      seedDb.run(sql`INSERT INTO documents (id, user_id, title, source_type, status, colour, created_at)
          VALUES ('doc-2', (SELECT id FROM users WHERE username='alice'), 'Cours 2', 'photo', 'done', '#38BDF8', ${now.toISOString()})`);
      seedDb.run(sql`INSERT INTO documents (id, user_id, title, source_type, status, colour, created_at)
          VALUES ('doc-bob', (SELECT id FROM users WHERE username='bob'), 'Cours de Bob', 'photo', 'done', '#8B5CF6', ${now.toISOString()})`);

      const res = await app.inject({ method: "GET", url: `/api/course-progress?${todayParam()}`, headers: { cookie: aliceCookie } });

      expect(res.statusCode).toBe(200);
      const items = res.json<{ documentId: string; title: string }[]>();
      expect(items.map((i) => i.documentId).sort()).toEqual(["doc-1", "doc-2"]);
    });

    it("flags a document past its deadline in-band, rather than dropping it from the list", async () => {
      const seedDb = openDatabase(dbPath);
      seedDb.run(sql`INSERT INTO deadlines (id, document_id, user_id, date, label, created_at)
          VALUES ('d1', 'doc-1', (SELECT id FROM users WHERE username='alice'), '2020-01-01', NULL, ${now.toISOString()})`);

      const res = await app.inject({ method: "GET", url: `/api/course-progress?${todayParam()}`, headers: { cookie: aliceCookie } });

      expect(res.statusCode).toBe(200);
      const items = res.json<{ documentId: string; kind: string; error?: string }[]>();
      const doc1 = items.find((i) => i.documentId === "doc-1");
      expect(doc1?.kind).toBe("error");
      expect(doc1?.error).toBe("deadline-in-past");
    });

    it("rejects a missing or invalid today (400)", async () => {
      const missing = await app.inject({ method: "GET", url: "/api/course-progress", headers: { cookie: aliceCookie } });
      expect(missing.statusCode).toBe(400);
    });

    it("requires authentication (401)", async () => {
      const res = await app.inject({ method: "GET", url: `/api/course-progress?${todayParam()}` });
      expect(res.statusCode).toBe(401);
    });
  });
});
