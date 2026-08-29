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

// buildApp wires the real systemClock (same as review's own int tests), so
// deadlines are expressed relative to the real "today" rather than the
// seeded `now` above, which is used only for row timestamps.
function farFutureDeadline(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 30);
  return d.toISOString().slice(0, 10);
}

// today is client-computed and required (docs/modules/progress.md): the
// server never guesses it. UTC is fine here since these tests don't
// exercise the timezone-correctness itself (day-boundary.unit.test.ts does).
function todayParam(): string {
  return `today=${new Date().toISOString().slice(0, 10)}`;
}

const generousAvailability = { mon: 60, tue: 60, wed: 60, thu: 60, fri: 60, sat: 60, sun: 60 };

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

  it("PUT /api/availability requires authentication (401)", async () => {
    const res = await app.inject({ method: "PUT", url: "/api/availability", payload: generousAvailability });
    expect(res.statusCode).toBe(401);
  });

  it("PUT /api/availability rejects a malformed body (400)", async () => {
    const res = await app.inject({ method: "PUT", url: "/api/availability", headers: { cookie: aliceCookie }, payload: { mon: -5 } });
    expect(res.statusCode).toBe(400);
  });

  it("GET /api/documents/:id/plan is 422 (ProgressInputError) before availability is ever set", async () => {
    await app.inject({ method: "POST", url: "/api/documents/doc-1/deadline", headers: { cookie: aliceCookie }, payload: { date: farFutureDeadline() } });
    const res = await app.inject({ method: "GET", url: `/api/documents/doc-1/plan?${todayParam()}`, headers: { cookie: aliceCookie } });
    expect(res.statusCode).toBe(422);
    expect(res.json()).toEqual({ error: "no-capacity" });
  });

  it("GET /api/documents/:id/plan rejects a missing or invalid today (400): the server never guesses 'today' itself", async () => {
    const missing = await app.inject({ method: "GET", url: "/api/documents/doc-1/plan", headers: { cookie: aliceCookie } });
    expect(missing.statusCode).toBe(400);

    const invalid = await app.inject({ method: "GET", url: "/api/documents/doc-1/plan?today=not-a-date", headers: { cookie: aliceCookie } });
    expect(invalid.statusCode).toBe(400);
  });

  it("GET /api/plan/today rejects a missing or invalid today (400)", async () => {
    const missing = await app.inject({ method: "GET", url: "/api/plan/today", headers: { cookie: aliceCookie } });
    expect(missing.statusCode).toBe(400);
  });

  it("sets a deadline and availability, then returns a plan covering the notion (200, feasible)", async () => {
    await app.inject({ method: "PUT", url: "/api/availability", headers: { cookie: aliceCookie }, payload: generousAvailability });
    const deadlineRes = await app.inject({
      method: "POST",
      url: "/api/documents/doc-1/deadline",
      headers: { cookie: aliceCookie },
      payload: { date: farFutureDeadline(), label: "Contrôle" },
    });
    expect(deadlineRes.statusCode).toBe(204);

    const planRes = await app.inject({ method: "GET", url: `/api/documents/doc-1/plan?${todayParam()}`, headers: { cookie: aliceCookie } });
    expect(planRes.statusCode).toBe(200);
    const plan = planRes.json<{ feasible: boolean; shortfallMinutes: number; days: { entries: { kind: string; notionId: string }[] }[] }>();
    expect(plan.feasible).toBe(true);
    expect(plan.shortfallMinutes).toBe(0);
    const entries = plan.days.flatMap((d) => d.entries);
    expect(entries.some((e) => e.notionId === "n1" && e.kind === "learn")).toBe(true);
  });

  it("GET /api/documents/:id/plan requires authentication (401)", async () => {
    const res = await app.inject({ method: "GET", url: "/api/documents/doc-1/plan" });
    expect(res.statusCode).toBe(401);
  });

  it("another user cannot read or set a deadline on someone else's document (403)", async () => {
    const getRes = await app.inject({ method: "GET", url: `/api/documents/doc-1/plan?${todayParam()}`, headers: { cookie: bobCookie } });
    expect(getRes.statusCode).toBe(403);

    const postRes = await app.inject({ method: "POST", url: "/api/documents/doc-1/deadline", headers: { cookie: bobCookie }, payload: { date: farFutureDeadline() } });
    expect(postRes.statusCode).toBe(403);

    const deleteRes = await app.inject({ method: "DELETE", url: "/api/documents/doc-1/deadline", headers: { cookie: bobCookie } });
    expect(deleteRes.statusCode).toBe(403);
  });

  it("DELETE /api/documents/:id/deadline removes it: the plan becomes a steady (no-deadline) plan", async () => {
    await app.inject({ method: "PUT", url: "/api/availability", headers: { cookie: aliceCookie }, payload: generousAvailability });
    await app.inject({ method: "POST", url: "/api/documents/doc-1/deadline", headers: { cookie: aliceCookie }, payload: { date: farFutureDeadline() } });

    const deleteRes = await app.inject({ method: "DELETE", url: "/api/documents/doc-1/deadline", headers: { cookie: aliceCookie } });
    expect(deleteRes.statusCode).toBe(204);

    const planRes = await app.inject({ method: "GET", url: `/api/documents/doc-1/plan?${todayParam()}`, headers: { cookie: aliceCookie } });
    expect(planRes.statusCode).toBe(200);
    expect(planRes.json<{ feasible: boolean }>().feasible).toBe(true);
  });

  it("GET /api/plan/today aggregates today's entries across the user's documents", async () => {
    await app.inject({ method: "PUT", url: "/api/availability", headers: { cookie: aliceCookie }, payload: generousAvailability });
    await app.inject({ method: "POST", url: "/api/documents/doc-1/deadline", headers: { cookie: aliceCookie }, payload: { date: farFutureDeadline() } });

    const res = await app.inject({ method: "GET", url: `/api/plan/today?${todayParam()}`, headers: { cookie: aliceCookie } });
    expect(res.statusCode).toBe(200);
    const entries = res.json<{ documentId: string; notionId: string }[]>();
    expect(entries.some((e) => e.documentId === "doc-1" && e.notionId === "n1")).toBe(true);
  });

  it("GET /api/plan/today requires authentication (401)", async () => {
    const res = await app.inject({ method: "GET", url: "/api/plan/today" });
    expect(res.statusCode).toBe(401);
  });

  it("POST /api/plan/days/:date/complete records history, scoped to the caller", async () => {
    const res = await app.inject({ method: "POST", url: "/api/plan/days/2026-01-05/complete", headers: { cookie: aliceCookie } });
    expect(res.statusCode).toBe(204);

    const seedDb = openDatabase(dbPath);
    const rows = seedDb.all<{ user_id: string; date: string; completed: number }>(sql`SELECT * FROM plan_history`);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.date).toBe("2026-01-05");
    expect(rows[0]?.completed).toBe(1);
  });

  it("POST /api/plan/days/:date/complete requires authentication (401)", async () => {
    const res = await app.inject({ method: "POST", url: "/api/plan/days/2026-01-05/complete" });
    expect(res.statusCode).toBe(401);
  });
});
