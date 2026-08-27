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

describe("cards routes", () => {
  let dir: string;
  let dbPath: string;
  let app: ReturnType<typeof buildApp>;
  let aliceCookie: string;
  let bobCookie: string;

  beforeEach(async () => {
    dir = mkdtempSync(path.join(tmpdir(), "studia-api-cards-"));
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

  it("lists a notion's cards", async () => {
    const res = await app.inject({ method: "GET", url: "/api/notions/n1/cards", headers: { cookie: aliceCookie } });
    expect(res.statusCode).toBe(200);
    expect(res.json<{ id: string }[]>().map((c) => c.id)).toEqual(["c1"]);
  });

  it("GET .../cards requires authentication (401)", async () => {
    const res = await app.inject({ method: "GET", url: "/api/notions/n1/cards" });
    expect(res.statusCode).toBe(401);
  });

  it("enqueues a generate-cards job for one notion", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/notions/n1/generate",
      headers: { cookie: aliceCookie },
      payload: { types: ["flashcard"] },
    });
    expect(res.statusCode).toBe(202);
    expect(res.json<{ jobId: string }>().jobId).toBeTruthy();
  });

  it("generate rejects an invalid body (400)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/notions/n1/generate",
      headers: { cookie: aliceCookie },
      payload: { types: ["not-a-type"] },
    });
    expect(res.statusCode).toBe(400);
  });

  it("another user gets 403 requesting generation for someone else's notion", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/notions/n1/generate",
      headers: { cookie: bobCookie },
      payload: { types: ["flashcard"] },
    });
    expect(res.statusCode).toBe(403);
  });

  it("enqueues one generate-cards job per notion for the whole document, and generation-status reflects it", async () => {
    const res = await app.inject({ method: "POST", url: "/api/documents/doc-1/generate", headers: { cookie: aliceCookie } });
    expect(res.statusCode).toBe(202);
    expect(res.json<{ jobIds: string[] }>().jobIds).toHaveLength(1);

    const status = await app.inject({ method: "GET", url: "/api/documents/doc-1/generation-status", headers: { cookie: aliceCookie } });
    expect(status.json()).toEqual({ done: 0, total: 1, failed: 0 });
  });

  it("deletes a card", async () => {
    const res = await app.inject({ method: "DELETE", url: "/api/cards/c1", headers: { cookie: aliceCookie } });
    expect(res.statusCode).toBe(204);
  });

  it("another user gets 403 deleting a card", async () => {
    const res = await app.inject({ method: "DELETE", url: "/api/cards/c1", headers: { cookie: bobCookie } });
    expect(res.statusCode).toBe(403);
  });
});
