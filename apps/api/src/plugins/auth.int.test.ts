import Fastify from "fastify";
import { HmacSessionCodec, type Clock, type UserRepository } from "@studia/core";
import { afterEach, describe, expect, it } from "vitest";
import { authPlugin, SESSION_COOKIE_NAME } from "./auth.js";

const now = new Date("2026-01-01T00:00:00Z");
const fixedClock: Clock = { now: () => now };

function fakeUserRepository(): UserRepository {
  return {
    findByUsername: () => Promise.resolve(null),
    findById: (id) =>
      id === "u1"
        ? Promise.resolve({ id: "u1", username: "alex", createdAt: now.toISOString(), sessionVersion: 1 })
        : Promise.resolve(null),
    upsertPassword: () => Promise.resolve(),
  };
}

function buildTestApp() {
  const sessionCodec = new HmacSessionCodec("test-secret");
  const app = Fastify();
  void app.register(authPlugin, { sessionCodec, userRepository: fakeUserRepository(), clock: fixedClock });

  app.get("/api/protected", (request) => ({ user: request.user }));
  app.get("/api/public", { config: { public: true } }, () => ({ ok: true }));
  app.post("/api/public-mutating", { config: { public: true } }, () => ({ ok: true }));
  app.get("/not-api", () => ({ ok: true }));

  return { app, sessionCodec };
}

describe("authPlugin default-deny", () => {
  let app: ReturnType<typeof buildTestApp>["app"];
  afterEach(() => app.close());

  it("denies a brand-new /api/* route with no cookie and no opt-out (401)", async () => {
    ({ app } = buildTestApp());

    const res = await app.inject({ method: "GET", url: "/api/protected" });

    expect(res.statusCode).toBe(401);
  });

  it("allows a route explicitly marked config.public", async () => {
    ({ app } = buildTestApp());

    const res = await app.inject({ method: "GET", url: "/api/public" });

    expect(res.statusCode).toBe(200);
  });

  it("does not guard routes outside /api/*", async () => {
    ({ app } = buildTestApp());

    const res = await app.inject({ method: "GET", url: "/not-api" });

    expect(res.statusCode).toBe(200);
  });

  it("resolves request.user and lets the request through with a valid session cookie", async () => {
    const built = buildTestApp();
    app = built.app;
    const token = built.sessionCodec.sign({ userId: "u1", sessionVersion: 1 }, now);

    const res = await app.inject({
      method: "GET",
      url: "/api/protected",
      headers: { cookie: `${SESSION_COOKIE_NAME}=${token}` },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ user: { id: "u1", username: "alex", createdAt: now.toISOString() } });
  });

  it("rejects a tampered session cookie (401)", async () => {
    ({ app } = buildTestApp());

    const res = await app.inject({
      method: "GET",
      url: "/api/protected",
      headers: { cookie: `${SESSION_COOKIE_NAME}=not-a-real-token` },
    });

    expect(res.statusCode).toBe(401);
  });
});

describe("authPlugin origin check on mutating requests", () => {
  let app: ReturnType<typeof buildTestApp>["app"];
  afterEach(() => app.close());

  it("rejects a mutating request whose Origin does not match Host, even on a public route (403)", async () => {
    ({ app } = buildTestApp());

    const res = await app.inject({
      method: "POST",
      url: "/api/public-mutating",
      headers: { origin: "https://evil.example", host: "studia.example" },
    });

    expect(res.statusCode).toBe(403);
  });

  it("allows a mutating request with a matching Origin", async () => {
    ({ app } = buildTestApp());

    const res = await app.inject({
      method: "POST",
      url: "/api/public-mutating",
      headers: { origin: "https://studia.example", host: "studia.example" },
    });

    expect(res.statusCode).toBe(200);
  });

  it("allows a mutating request with no Origin header at all", async () => {
    ({ app } = buildTestApp());

    const res = await app.inject({ method: "POST", url: "/api/public-mutating" });

    expect(res.statusCode).toBe(200);
  });
});
