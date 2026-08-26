import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createOrResetAccount, HmacSessionCodec, SqliteUserRepository, Argon2PasswordHasher, uuidV7Generator } from "@studia/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../app.js";
import { openDatabase } from "../db/connection.js";
import { runMigrations } from "../db/migrate.js";
import { SESSION_COOKIE_NAME } from "../plugins/auth.js";

function extractCookie(setCookieHeader: string | string[] | undefined): string {
  const raw = Array.isArray(setCookieHeader) ? setCookieHeader[0] : setCookieHeader;
  if (!raw) throw new Error("expected a Set-Cookie header");
  const match = /^([^=]+)=([^;]+)/.exec(raw);
  if (!match) throw new Error(`could not parse Set-Cookie header: ${raw}`);
  return `${match[1]}=${match[2]}`;
}

describe("auth routes", () => {
  let dir: string;
  let dbPath: string;
  let app: ReturnType<typeof buildApp>;

  beforeEach(async () => {
    dir = mkdtempSync(path.join(tmpdir(), "studia-api-auth-"));
    dbPath = path.join(dir, "test.db");

    // Seed a user via the same path the CLI uses, against the same db file
    // buildApp will open.
    const seedDb = openDatabase(dbPath);
    runMigrations(seedDb);
    await createOrResetAccount(
      {
        userRepository: new SqliteUserRepository(seedDb),
        passwordHasher: new Argon2PasswordHasher(),
        idGenerator: uuidV7Generator,
      },
      "alex",
      "correct-horse",
      new Date(),
    );

    app = buildApp({ databasePath: dbPath, sessionSecret: "test-session-secret", cookieSecure: false });
  });

  afterEach(async () => {
    await app.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("POST /api/auth/login with correct credentials returns 204 and sets a session cookie", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { username: "alex", password: "correct-horse" },
    });

    expect(res.statusCode).toBe(204);
    expect(res.headers["set-cookie"]).toBeDefined();
  });

  it("POST /api/auth/login with a wrong password returns 401", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { username: "alex", password: "wrong" },
    });

    expect(res.statusCode).toBe(401);
  });

  it("POST /api/auth/login with an unknown username returns 401", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { username: "ghost", password: "whatever" },
    });

    expect(res.statusCode).toBe(401);
  });

  it("POST /api/auth/login with an invalid body returns 400", async () => {
    const res = await app.inject({ method: "POST", url: "/api/auth/login", payload: { username: "alex" } });

    expect(res.statusCode).toBe(400);
  });

  it("rate-limits after 5 failed attempts from the same ip (429)", async () => {
    for (let i = 0; i < 5; i++) {
      const res = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: { username: "alex", password: "wrong" },
      });
      expect(res.statusCode).toBe(401);
    }

    const res = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { username: "alex", password: "wrong" },
    });

    expect(res.statusCode).toBe(429);
  });

  it("GET /api/me without a session returns 401", async () => {
    const res = await app.inject({ method: "GET", url: "/api/me" });

    expect(res.statusCode).toBe(401);
  });

  it("GET /api/me with a valid session returns the user", async () => {
    const login = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { username: "alex", password: "correct-horse" },
    });
    const cookie = extractCookie(login.headers["set-cookie"]);

    const res = await app.inject({ method: "GET", url: "/api/me", headers: { cookie } });

    expect(res.statusCode).toBe(200);
    const body: unknown = res.json();
    expect(body).toMatchObject({ username: "alex" });
    expect(typeof (body as { id: unknown }).id).toBe("string");
  });

  it("POST /api/auth/logout clears the cookie and returns 204, and /api/me is then unauthenticated", async () => {
    const login = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { username: "alex", password: "correct-horse" },
    });
    const cookie = extractCookie(login.headers["set-cookie"]);

    const logout = await app.inject({ method: "POST", url: "/api/auth/logout", headers: { cookie } });
    expect(logout.statusCode).toBe(204);

    const clearedCookieHeader = logout.headers["set-cookie"];
    expect(clearedCookieHeader).toBeDefined();

    const me = await app.inject({ method: "GET", url: "/api/me" });
    expect(me.statusCode).toBe(401);
  });

  it("POST /api/auth/logout without any session still returns 204", async () => {
    const res = await app.inject({ method: "POST", url: "/api/auth/logout" });

    expect(res.statusCode).toBe(204);
  });

  it("a session signed for a different secret is rejected (401)", async () => {
    const foreignCodec = new HmacSessionCodec("a-different-secret");
    const token = foreignCodec.sign({ userId: "someone", sessionVersion: 1 }, new Date());

    const res = await app.inject({ method: "GET", url: "/api/me", headers: { cookie: `${SESSION_COOKIE_NAME}=${token}` } });

    expect(res.statusCode).toBe(401);
  });
});
