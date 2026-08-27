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

describe("notions routes", () => {
  let dir: string;
  let dbPath: string;
  let app: ReturnType<typeof buildApp>;
  let aliceCookie: string;
  let bobCookie: string;

  beforeEach(async () => {
    dir = mkdtempSync(path.join(tmpdir(), "studia-api-notions-"));
    dbPath = path.join(dir, "test.db");
    const seedDb = openDatabase(dbPath);
    runMigrations(seedDb);
    const identityDeps = { userRepository: new SqliteUserRepository(seedDb), passwordHasher: new Argon2PasswordHasher(), idGenerator: uuidV7Generator };
    await createOrResetAccount(identityDeps, "alice", "alice-pass", now);
    await createOrResetAccount(identityDeps, "bob", "bob-pass", now);

    seedDb.run(sql`INSERT INTO documents (id, user_id, title, source_type, status, colour, created_at)
        VALUES ('doc-1', (SELECT id FROM users WHERE username='alice'), 'Cours', 'photo', 'done', '#F87171', ${now.toISOString()})`);
    seedDb.run(sql`INSERT INTO notions (id, document_id, user_id, title, body, difficulty, position, created_at)
        VALUES ('n1', 'doc-1', (SELECT id FROM users WHERE username='alice'), 'Photosynthèse', 'Corps de la notion.', 'medium', 0, ${now.toISOString()})`);
    seedDb.run(sql`INSERT INTO notions (id, document_id, user_id, title, body, difficulty, position, created_at)
        VALUES ('n2', 'doc-1', (SELECT id FROM users WHERE username='alice'), 'Respiration', 'Autre corps.', 'medium', 1, ${now.toISOString()})`);

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

  it("lists a document's notions, ordered by position", async () => {
    const res = await app.inject({ method: "GET", url: "/api/documents/doc-1/notions", headers: { cookie: aliceCookie } });
    expect(res.statusCode).toBe(200);
    expect(res.json<{ id: string }[]>().map((n) => n.id)).toEqual(["n1", "n2"]);
  });

  it("GET .../notions requires authentication (401)", async () => {
    const res = await app.inject({ method: "GET", url: "/api/documents/doc-1/notions" });
    expect(res.statusCode).toBe(401);
  });

  it("another user's notions list is empty, not an error (scoped, not a 403 for a list endpoint)", async () => {
    const res = await app.inject({ method: "GET", url: "/api/documents/doc-1/notions", headers: { cookie: bobCookie } });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([]);
  });

  it("PATCH updates a notion's title", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: "/api/notions/n1",
      headers: { cookie: aliceCookie },
      payload: { title: "Nouveau titre" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json<{ title: string }>().title).toBe("Nouveau titre");
  });

  it("PATCH rejects an invalid title (400)", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: "/api/notions/n1",
      headers: { cookie: aliceCookie },
      payload: { title: "Hi" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("PATCH another user's notion is refused (403)", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: "/api/notions/n1",
      headers: { cookie: bobCookie },
      payload: { title: "Vol" },
    });
    expect(res.statusCode).toBe(403);
  });

  it("reorders a document's notions, full reversal", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/documents/doc-1/notions/reorder",
      headers: { cookie: aliceCookie },
      payload: { orderedIds: ["n2", "n1"] },
    });
    expect(res.statusCode).toBe(204);

    const list = await app.inject({ method: "GET", url: "/api/documents/doc-1/notions", headers: { cookie: aliceCookie } });
    expect(list.json<{ id: string }[]>().map((n) => n.id)).toEqual(["n2", "n1"]);
  });

  it("reorder rejects a partial list (400)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/documents/doc-1/notions/reorder",
      headers: { cookie: aliceCookie },
      payload: { orderedIds: ["n1"] },
    });
    expect(res.statusCode).toBe(400);
  });

  it("deletes a notion and renumbers the survivors", async () => {
    const res = await app.inject({ method: "DELETE", url: "/api/notions/n1", headers: { cookie: aliceCookie } });
    expect(res.statusCode).toBe(204);

    const list = await app.inject({ method: "GET", url: "/api/documents/doc-1/notions", headers: { cookie: aliceCookie } });
    expect(list.json<{ id: string; position: number }[]>()).toEqual([expect.objectContaining({ id: "n2", position: 0 }) as unknown]);
  });

  it("another user gets 403 deleting a notion", async () => {
    const res = await app.inject({ method: "DELETE", url: "/api/notions/n1", headers: { cookie: bobCookie } });
    expect(res.statusCode).toBe(403);
  });

  it("search finds a notion by title, scoped to the caller", async () => {
    const res = await app.inject({ method: "GET", url: "/api/search?q=photosynthèse", headers: { cookie: aliceCookie } });
    expect(res.statusCode).toBe(200);
    expect(res.json<{ id: string }[]>().map((n) => n.id)).toEqual(["n1"]);

    const bobRes = await app.inject({ method: "GET", url: "/api/search?q=photosynthèse", headers: { cookie: bobCookie } });
    expect(bobRes.json()).toEqual([]);
  });
});
