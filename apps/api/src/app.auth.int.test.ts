import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "./app.js";

describe("buildApp — session secret", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), "studia-api-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("throws loudly and clearly when sessionSecret is missing", () => {
    expect(() =>
      buildApp({ databasePath: path.join(dir, "test.db"), dataDir: dir, sessionSecret: "", cookieSecure: false, llmAdapter: "fixture" }),
    ).toThrow(/SESSION_SECRET/);
  });
});

describe("buildApp — default-deny", () => {
  let dir: string;
  let app: ReturnType<typeof buildApp>;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), "studia-api-"));
    app = buildApp({
      databasePath: path.join(dir, "test.db"),
      dataDir: dir,
      sessionSecret: "test-session-secret",
      cookieSecure: false,
      llmAdapter: "fixture",
    });
  });

  afterEach(async () => {
    await app.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("GET /api/health stays reachable without a session (Railway healthcheck depends on this)", async () => {
    const res = await app.inject({ method: "GET", url: "/api/health" });
    expect(res.statusCode).toBe(200);
  });

  it("a brand-new /api/* route added to the real, fully-wired app is denied by default, proving no route can be added without auth by accident", async () => {
    app.get("/api/some-future-route-nobody-remembered-to-protect", () => ({ secret: "data" }));

    const res = await app.inject({ method: "GET", url: "/api/some-future-route-nobody-remembered-to-protect" });

    expect(res.statusCode).toBe(401);
  });
});
