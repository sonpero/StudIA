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

// M11's single trigger: POST /api/documents/:id/cards/generate
// (docs/reports/notions-cles-conception.md).
describe("course-level card generation route", () => {
  let dir: string;
  let app: ReturnType<typeof buildApp>;
  let db: Db;
  let aliceCookie: string;
  let bobCookie: string;

  beforeEach(async () => {
    dir = mkdtempSync(path.join(tmpdir(), "studia-api-course-cards-"));
    const dbPath = path.join(dir, "test.db");
    db = openDatabase(dbPath);
    runMigrations(db);
    const identityDeps = { userRepository: new SqliteUserRepository(db), passwordHasher: new Argon2PasswordHasher(), idGenerator: uuidV7Generator };
    await createOrResetAccount(identityDeps, "alice", "alice-pass", now);
    await createOrResetAccount(identityDeps, "bob", "bob-pass", now);

    for (const doc of ["fresh", "legacy"]) {
      db.run(sql`INSERT INTO documents (id, user_id, title, source_type, status, colour, created_at)
          VALUES (${doc}, (SELECT id FROM users WHERE username='alice'), 'Cours', 'pdf', 'done', '#F87171', ${now.toISOString()})`);
      db.run(sql`INSERT INTO notions (id, document_id, user_id, title, body, difficulty, position, created_at)
          VALUES (${`n-${doc}`}, ${doc}, (SELECT id FROM users WHERE username='alice'), 'Notion', 'Corps.', 'medium', 0, ${now.toISOString()})`);
    }
    db.run(sql`INSERT INTO cards (id, notion_id, user_id, type, state, question, answer, options_json, created_at)
        VALUES ('old-card', 'n-legacy', (SELECT id FROM users WHERE username='alice'), 'flashcard', 'active', 'Q ?', 'R', NULL, ${now.toISOString()})`);

    app = buildApp({ databasePath: dbPath, dataDir: dir, sessionSecret: "test-session-secret", cookieSecure: false, llmAdapter: "fixture" });
    aliceCookie = extractCookie((await app.inject({ method: "POST", url: "/api/auth/login", payload: { username: "alice", password: "alice-pass" } })).headers["set-cookie"]);
    bobCookie = extractCookie((await app.inject({ method: "POST", url: "/api/auth/login", payload: { username: "bob", password: "bob-pass" } })).headers["set-cookie"]);
  });

  afterEach(async () => {
    await app.close();
    rmSync(dir, { recursive: true, force: true });
  });

  const generate = (documentId: string, cookie?: string) =>
    app.inject({ method: "POST", url: `/api/documents/${documentId}/cards/generate`, headers: cookie ? { cookie } : {} });

  it("enqueues one generate-course-cards job for a course without cards, and generation-status reports it", async () => {
    const res = await generate("fresh", aliceCookie);

    expect(res.statusCode).toBe(202);
    expect(res.json<{ jobId: string }>().jobId).toEqual(expect.any(String));
    expect(db.all(sql`SELECT type, payload_json FROM jobs`)).toEqual([{ type: "generate-course-cards", payload_json: '{"documentId":"fresh"}' }]);

    const status = await app.inject({ method: "GET", url: "/api/documents/fresh/generation-status", headers: { cookie: aliceCookie } });
    expect(status.json()).toEqual({ done: 0, total: 1, failed: 0 });
  });

  it("refuses a second request while the first job is waiting (409 in-progress)", async () => {
    await generate("fresh", aliceCookie);
    const res = await generate("fresh", aliceCookie);
    expect(res.statusCode).toBe(409);
    expect(res.json()).toEqual({ error: "in-progress" });
  });

  it("refuses a course that already has cards (409 has-cards), and enqueues nothing", async () => {
    const res = await generate("legacy", aliceCookie);
    expect(res.statusCode).toBe(409);
    expect(res.json()).toEqual({ error: "has-cards" });
    expect(db.all(sql`SELECT id FROM jobs`)).toEqual([]);
  });

  it("another user gets 403, an unknown course too", async () => {
    expect((await generate("fresh", bobCookie)).statusCode).toBe(403);
    expect((await generate("no-such-doc", aliceCookie)).statusCode).toBe(403);
  });

  it("requires authentication (401)", async () => {
    expect((await generate("fresh")).statusCode).toBe(401);
  });
});
