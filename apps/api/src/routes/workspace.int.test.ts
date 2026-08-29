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

type TodoBody = { id: string; label: string; dueDate: string | null; documentId: string | null; done: boolean; source: string };

describe("workspace routes", () => {
  let dir: string;
  let dbPath: string;
  let app: ReturnType<typeof buildApp>;
  let aliceCookie: string;
  let bobCookie: string;

  beforeEach(async () => {
    dir = mkdtempSync(path.join(tmpdir(), "studia-api-workspace-"));
    dbPath = path.join(dir, "test.db");
    const seedDb = openDatabase(dbPath);
    runMigrations(seedDb);
    const identityDeps = { userRepository: new SqliteUserRepository(seedDb), passwordHasher: new Argon2PasswordHasher(), idGenerator: uuidV7Generator };
    await createOrResetAccount(identityDeps, "alice", "alice-pass", now);
    await createOrResetAccount(identityDeps, "bob", "bob-pass", now);

    seedDb.run(sql`INSERT INTO documents (id, user_id, title, source_type, status, colour, created_at)
        VALUES ('doc-1', (SELECT id FROM users WHERE username='alice'), 'Cours', 'photo', 'done', '#F87171', ${now.toISOString()})`);
    seedDb.run(sql`INSERT INTO documents (id, user_id, title, source_type, status, colour, created_at)
        VALUES ('doc-bob', (SELECT id FROM users WHERE username='bob'), 'Cours de Bob', 'photo', 'done', '#F87171', ${now.toISOString()})`);

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

  async function createAliceTodo(body: Record<string, unknown> = { label: "Réviser le chapitre 3" }): Promise<{ id: string }> {
    const res = await app.inject({ method: "POST", url: "/api/todos", headers: { cookie: aliceCookie }, payload: body });
    return res.json<TodoBody>();
  }

  describe("POST /api/todos", () => {
    it("creates a todo (201) with a generated id, not done, source manual", async () => {
      const res = await app.inject({ method: "POST", url: "/api/todos", headers: { cookie: aliceCookie }, payload: { label: "Réviser le chapitre 3" } });

      expect(res.statusCode).toBe(201);
      const body = res.json<TodoBody>();
      expect(body).toMatchObject({ label: "Réviser le chapitre 3", dueDate: null, documentId: null, done: false, source: "manual" });
      expect(typeof body.id).toBe("string");
    });

    it("accepts a documentId the caller owns", async () => {
      const res = await app.inject({ method: "POST", url: "/api/todos", headers: { cookie: aliceCookie }, payload: { label: "Réviser", documentId: "doc-1" } });

      expect(res.statusCode).toBe(201);
      expect(res.json<TodoBody>().documentId).toBe("doc-1");
    });

    it("rejects a documentId belonging to another user (400)", async () => {
      const res = await app.inject({ method: "POST", url: "/api/todos", headers: { cookie: aliceCookie }, payload: { label: "Réviser", documentId: "doc-bob" } });

      expect(res.statusCode).toBe(400);
      expect(res.json()).toEqual({ error: "invalid-document" });
    });

    it("rejects an empty label (400)", async () => {
      const res = await app.inject({ method: "POST", url: "/api/todos", headers: { cookie: aliceCookie }, payload: { label: "" } });
      expect(res.statusCode).toBe(400);
    });

    it("requires authentication (401)", async () => {
      const res = await app.inject({ method: "POST", url: "/api/todos", payload: { label: "x" } });
      expect(res.statusCode).toBe(401);
    });
  });

  describe("PATCH /api/todos/:id", () => {
    it("updates the label (200) and returns the updated todo", async () => {
      const { id } = await createAliceTodo();

      const res = await app.inject({ method: "PATCH", url: `/api/todos/${id}`, headers: { cookie: aliceCookie }, payload: { label: "Nouveau libellé" } });

      expect(res.statusCode).toBe(200);
      expect(res.json<TodoBody>().label).toBe("Nouveau libellé");
    });

    it("toggles done (200)", async () => {
      const { id } = await createAliceTodo();

      const res = await app.inject({ method: "PATCH", url: `/api/todos/${id}`, headers: { cookie: aliceCookie }, payload: { done: true } });

      expect(res.statusCode).toBe(200);
      expect(res.json<TodoBody>().done).toBe(true);
    });

    it("applies every field in the body, done combined with a label edit, in one call", async () => {
      const { id } = await createAliceTodo();

      const res = await app.inject({ method: "PATCH", url: `/api/todos/${id}`, headers: { cookie: aliceCookie }, payload: { label: "Nouveau libellé", done: true } });

      expect(res.statusCode).toBe(200);
      const body = res.json<TodoBody>();
      expect(body.label).toBe("Nouveau libellé");
      expect(body.done).toBe(true);
    });

    it("links a documentId the caller owns", async () => {
      const { id } = await createAliceTodo();

      const res = await app.inject({ method: "PATCH", url: `/api/todos/${id}`, headers: { cookie: aliceCookie }, payload: { documentId: "doc-1" } });

      expect(res.statusCode).toBe(200);
      expect(res.json<TodoBody>().documentId).toBe("doc-1");
    });

    it("rejects a documentId belonging to another user (400)", async () => {
      const { id } = await createAliceTodo();

      const res = await app.inject({ method: "PATCH", url: `/api/todos/${id}`, headers: { cookie: aliceCookie }, payload: { documentId: "doc-bob" } });

      expect(res.statusCode).toBe(400);
      expect(res.json()).toEqual({ error: "invalid-document" });
    });

    it("rejects an empty body (400)", async () => {
      const { id } = await createAliceTodo();
      const res = await app.inject({ method: "PATCH", url: `/api/todos/${id}`, headers: { cookie: aliceCookie }, payload: {} });
      expect(res.statusCode).toBe(400);
    });

    it("rejects another user's todo (403), a distinct body from a validation failure", async () => {
      const { id } = await createAliceTodo();

      const res = await app.inject({ method: "PATCH", url: `/api/todos/${id}`, headers: { cookie: bobCookie }, payload: { label: "x" } });

      expect(res.statusCode).toBe(403);
      expect(res.json()).toEqual({ error: "not-found" });
    });

    it("requires authentication (401)", async () => {
      const { id } = await createAliceTodo();
      const res = await app.inject({ method: "PATCH", url: `/api/todos/${id}`, payload: { label: "x" } });
      expect(res.statusCode).toBe(401);
    });
  });

  describe("DELETE /api/todos/:id", () => {
    it("removes the todo (204)", async () => {
      const { id } = await createAliceTodo();

      const res = await app.inject({ method: "DELETE", url: `/api/todos/${id}`, headers: { cookie: aliceCookie } });

      expect(res.statusCode).toBe(204);
      const getAfter = await app.inject({ method: "PATCH", url: `/api/todos/${id}`, headers: { cookie: aliceCookie }, payload: { label: "x" } });
      expect(getAfter.statusCode).toBe(403);
    });

    it("rejects another user's todo (403)", async () => {
      const { id } = await createAliceTodo();

      const res = await app.inject({ method: "DELETE", url: `/api/todos/${id}`, headers: { cookie: bobCookie } });

      expect(res.statusCode).toBe(403);
      expect(res.json()).toEqual({ error: "not-found" });
    });

    it("requires authentication (401)", async () => {
      const { id } = await createAliceTodo();
      const res = await app.inject({ method: "DELETE", url: `/api/todos/${id}` });
      expect(res.statusCode).toBe(401);
    });
  });

  describe("GET /api/today", () => {
    const query = "today=2026-03-02&dayBoundary=2026-03-03T00%3A00%3A00.000Z";

    it("composes the view (200): a todo the caller created appears in it", async () => {
      await createAliceTodo({ label: "Réviser le chapitre 3" });

      const res = await app.inject({ method: "GET", url: `/api/today?${query}`, headers: { cookie: aliceCookie } });

      expect(res.statusCode).toBe(200);
      const body = res.json<{ date: string; todos: TodoBody[] }>();
      expect(body.date).toBe("2026-03-02");
      expect(body.todos).toHaveLength(1);
      expect(body.todos[0]?.label).toBe("Réviser le chapitre 3");
    });

    it("is empty for a user with nothing at all", async () => {
      const res = await app.inject({ method: "GET", url: `/api/today?${query}`, headers: { cookie: bobCookie } });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ date: "2026-03-02", dueCards: [], notionsBelowTarget: [], todos: [], upcomingDeadlines: [] });
    });

    it("scopes todos to the caller: bob's todo never appears in alice's view", async () => {
      const bobTodoRes = await app.inject({ method: "POST", url: "/api/todos", headers: { cookie: bobCookie }, payload: { label: "Todo de Bob" } });
      expect(bobTodoRes.statusCode).toBe(201);

      const res = await app.inject({ method: "GET", url: `/api/today?${query}`, headers: { cookie: aliceCookie } });

      expect(res.json<{ todos: TodoBody[] }>().todos).toEqual([]);
    });

    it("rejects a missing or invalid today (400)", async () => {
      const missing = await app.inject({ method: "GET", url: "/api/today?dayBoundary=2026-03-03T00%3A00%3A00.000Z", headers: { cookie: aliceCookie } });
      expect(missing.statusCode).toBe(400);

      const invalid = await app.inject({ method: "GET", url: "/api/today?today=not-a-date&dayBoundary=2026-03-03T00%3A00%3A00.000Z", headers: { cookie: aliceCookie } });
      expect(invalid.statusCode).toBe(400);
    });

    it("rejects a missing or invalid dayBoundary (400)", async () => {
      const missing = await app.inject({ method: "GET", url: "/api/today?today=2026-03-02", headers: { cookie: aliceCookie } });
      expect(missing.statusCode).toBe(400);

      const invalid = await app.inject({ method: "GET", url: "/api/today?today=2026-03-02&dayBoundary=not-a-date", headers: { cookie: aliceCookie } });
      expect(invalid.statusCode).toBe(400);
    });

    it("requires authentication (401)", async () => {
      const res = await app.inject({ method: "GET", url: `/api/today?${query}` });
      expect(res.statusCode).toBe(401);
    });
  });
});
