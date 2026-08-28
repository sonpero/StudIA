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
// The client's local "start of tomorrow" — a distinct clock from `now`,
// deliberately a day later so it never accidentally coincides with a
// seeded timestamp (packages/core's sqlite-review-repository.int.test.ts
// hit exactly that collision).
const dayBoundary = "2026-01-02T00:00:00.000Z";

describe("review routes", () => {
  let dir: string;
  let dbPath: string;
  let app: ReturnType<typeof buildApp>;
  let aliceCookie: string;
  let bobCookie: string;

  beforeEach(async () => {
    dir = mkdtempSync(path.join(tmpdir(), "studia-api-review-"));
    dbPath = path.join(dir, "test.db");
    const seedDb = openDatabase(dbPath);
    runMigrations(seedDb);
    const identityDeps = { userRepository: new SqliteUserRepository(seedDb), passwordHasher: new Argon2PasswordHasher(), idGenerator: uuidV7Generator };
    await createOrResetAccount(identityDeps, "alice", "alice-pass", now);
    await createOrResetAccount(identityDeps, "bob", "bob-pass", now);

    seedDb.run(sql`INSERT INTO documents (id, user_id, title, source_type, status, colour, created_at)
        VALUES ('doc-1', (SELECT id FROM users WHERE username='alice'), 'Cours', 'photo', 'done', '#F87171', ${now.toISOString()})`);
    seedDb.run(sql`INSERT INTO notions (id, document_id, user_id, title, body, difficulty, position, created_at)
        VALUES ('n1', 'doc-1', (SELECT id FROM users WHERE username='alice'), 'Notion', 'Corps.', 'medium', 0, ${now.toISOString()})`);
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

  it("lists due cards (a fresh card has never been reviewed, so it's due)", async () => {
    const res = await app.inject({ method: "GET", url: `/api/review/due?dayBoundary=${dayBoundary}`, headers: { cookie: aliceCookie } });
    expect(res.statusCode).toBe(200);
    expect(res.json<{ cardId: string }[]>().map((c) => c.cardId)).toEqual(["c1"]);
  });

  it("GET /api/review/due requires authentication (401)", async () => {
    const res = await app.inject({ method: "GET", url: `/api/review/due?dayBoundary=${dayBoundary}` });
    expect(res.statusCode).toBe(401);
  });

  it("GET /api/review/due rejects a missing or invalid dayBoundary (400): the server never guesses 'today' itself", async () => {
    const missing = await app.inject({ method: "GET", url: "/api/review/due", headers: { cookie: aliceCookie } });
    expect(missing.statusCode).toBe(400);

    const invalid = await app.inject({ method: "GET", url: "/api/review/due?dayBoundary=not-a-date", headers: { cookie: aliceCookie } });
    expect(invalid.statusCode).toBe(400);
  });

  it("another user's due list is empty", async () => {
    const res = await app.inject({ method: "GET", url: `/api/review/due?dayBoundary=${dayBoundary}`, headers: { cookie: bobCookie } });
    expect(res.json()).toEqual([]);
  });

  it("due cards are enriched with mastered, computed from the schedule", async () => {
    const res = await app.inject({ method: "GET", url: `/api/review/due?dayBoundary=${dayBoundary}`, headers: { cookie: aliceCookie } });
    expect(res.json<{ cardId: string; mastered: boolean }[]>()).toEqual([{ cardId: "c1", mastered: false, notionId: "n1", type: "flashcard", state: "active", question: "Question ?", answer: "Réponse", options: null, schedule: null }]);
  });

  it("GET /api/review/due filters by notionId, to review a single notion", async () => {
    const matching = await app.inject({ method: "GET", url: `/api/review/due?notionId=n1&dayBoundary=${dayBoundary}`, headers: { cookie: aliceCookie } });
    expect(matching.json<{ cardId: string }[]>().map((c) => c.cardId)).toEqual(["c1"]);

    const nonMatching = await app.inject({ method: "GET", url: `/api/review/due?notionId=does-not-exist&dayBoundary=${dayBoundary}`, headers: { cookie: aliceCookie } });
    expect(nonMatching.json()).toEqual([]);
  });

  it("a card due later today (before dayBoundary) is revisable now, end to end", async () => {
    const laterToday = new Date(new Date(dayBoundary).getTime() - 1).toISOString();
    const seedDb = openDatabase(dbPath);
    seedDb.run(sql`INSERT INTO card_schedules (card_id, user_id, due, stability, difficulty, reps, lapses, last_reviewed_at)
        VALUES ('c1', (SELECT id FROM users WHERE username='alice'), ${laterToday}, 2.3, 2.1, 1, 0, ${now.toISOString()})`);

    const res = await app.inject({ method: "GET", url: `/api/review/due?dayBoundary=${dayBoundary}`, headers: { cookie: aliceCookie } });

    expect(res.json<{ cardId: string }[]>().map((c) => c.cardId)).toEqual(["c1"]);
  });

  it("starts a session and draws its due cards", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/review/sessions",
      headers: { cookie: aliceCookie },
      payload: { documentId: "doc-1", dayBoundary },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ sessionId: string; cards: { cardId: string }[] }>();
    expect(body.sessionId).toBeTruthy();
    expect(body.cards.map((c) => c.cardId)).toEqual(["c1"]);
  });

  it("starts a session scoped to a single notion via notionId", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/review/sessions",
      headers: { cookie: aliceCookie },
      payload: { documentId: "doc-1", notionId: "n1", dayBoundary },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json<{ cards: { cardId: string }[] }>().cards.map((c) => c.cardId)).toEqual(["c1"]);
  });

  it("POST /api/review/sessions rejects a missing dayBoundary (400)", async () => {
    const res = await app.inject({ method: "POST", url: "/api/review/sessions", headers: { cookie: aliceCookie }, payload: { documentId: "doc-1" } });
    expect(res.statusCode).toBe(400);
  });

  it("submits a review and returns the new schedule, pushing the due date out", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/review/cards/c1",
      headers: { cookie: aliceCookie },
      payload: { rating: 3, elapsedMs: 4200 },
    });
    expect(res.statusCode).toBe(200);
    const schedule = res.json<{ due: string; reps: number }>();
    expect(schedule.reps).toBe(1);
    expect(new Date(schedule.due).getTime()).toBeGreaterThan(now.getTime());
  });

  it("submitting a review rejects an invalid rating (400)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/review/cards/c1",
      headers: { cookie: aliceCookie },
      payload: { rating: 9, elapsedMs: 1000 },
    });
    expect(res.statusCode).toBe(400);
  });

  it("abandoning a session ends it, and preserves already-answered reviews", async () => {
    const start = await app.inject({ method: "POST", url: "/api/review/sessions", headers: { cookie: aliceCookie }, payload: { dayBoundary } });
    const { sessionId } = start.json<{ sessionId: string }>();
    await app.inject({ method: "POST", url: "/api/review/cards/c1", headers: { cookie: aliceCookie }, payload: { rating: 3, elapsedMs: 1000 } });

    const res = await app.inject({ method: "POST", url: `/api/review/sessions/${sessionId}/abandon`, headers: { cookie: aliceCookie } });
    expect(res.statusCode).toBe(204);
  });

  it("another user gets 403 abandoning someone else's session", async () => {
    const start = await app.inject({ method: "POST", url: "/api/review/sessions", headers: { cookie: aliceCookie }, payload: { dayBoundary } });
    const { sessionId } = start.json<{ sessionId: string }>();

    const res = await app.inject({ method: "POST", url: `/api/review/sessions/${sessionId}/abandon`, headers: { cookie: bobCookie } });
    expect(res.statusCode).toBe(403);
  });

  it("reports progress for the document", async () => {
    const res = await app.inject({ method: "GET", url: `/api/documents/doc-1/progress?dayBoundary=${dayBoundary}`, headers: { cookie: aliceCookie } });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ mastered: 0, total: 1, nextDueDate: null });
  });

  it("GET /api/documents/:id/progress rejects a missing dayBoundary (400)", async () => {
    const res = await app.inject({ method: "GET", url: "/api/documents/doc-1/progress", headers: { cookie: aliceCookie } });
    expect(res.statusCode).toBe(400);
  });

  it("reports progress per notion for the document", async () => {
    const res = await app.inject({ method: "GET", url: "/api/documents/doc-1/notions-progress", headers: { cookie: aliceCookie } });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([{ notionId: "n1", masteredCards: 0, totalCards: 1 }]);
  });
});
