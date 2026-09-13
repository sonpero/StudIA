import { afterEach, describe, expect, it, vi } from "vitest";
import { endPomodoro, startPomodoro } from "./pomodoro-api.js";

// apps/api/src/routes/workspace.ts maps the domain's "not-found" close error
// to HTTP 403 (not 404) — confirmed by reading the route directly, not
// guessed from convention. But that same repository-level "not-found"
// (packages/core/src/workspace/infra/sqlite-todo-repository.ts's
// endPomodoroSession, filtered by `id AND userId` in one query) covers two
// different real situations indistinguishably at the domain layer: a session
// that is genuinely already closed (or never existed), and a session id that
// belongs to someone else entirely. Blanket-treating every 403 as "already
// closed" would silently swallow the second case too — a real authorization
// failure — so the client only ever treats the specific, tagged shape the
// route actually sends (`{error: "not-found"}`) as a no-op, and lets any
// other 403 body surface as a real error, exactly like a 500 would.
describe("endPomodoro", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("resolves normally on 204 (closed for the first time)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 204 })));
    await expect(endPomodoro("s1")).resolves.toBeUndefined();
  });

  it("treats a 403 whose body is specifically {error: \"not-found\"} as already-closed, not an error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "not-found" }), { status: 403 })));
    await expect(endPomodoro("s1")).resolves.toBeUndefined();
  });

  // The case the blanket "any 403 is fine" version would have swallowed: a
  // 403 for a different reason (a session id that isn't ours, or any future
  // domain error this route might one day map here too) must still surface
  // as a real failure, not be silently absorbed as "already closed".
  it("still throws on a 403 whose body does not say not-found (a real authorization failure, not an already-closed session)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "forbidden" }), { status: 403 })));
    await expect(endPomodoro("s1")).rejects.toThrow();
  });

  it("still throws on a 403 with no parseable body at all", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 403 })));
    await expect(endPomodoro("s1")).rejects.toThrow();
  });

  it("still throws on a genuine failure (e.g. 500)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 500 })));
    await expect(endPomodoro("s1")).rejects.toThrow();
  });
});

// M10 Phase 2, lot 3: the route accepts a type, never a duration
// (apps/api/src/routes/workspace.ts's startPomodoroBodySchema has no
// durationSeconds field at all). Unlike todoId (omitted entirely when
// absent, never sent as null — this file's own established convention),
// type is always sent explicitly: by the time this function is called,
// TodayScreen's own radio group has already resolved a concrete choice
// (defaulting to "focus" client-side, same default the route itself
// carries), so there is no "absent" case worth omitting — sending it
// explicitly means this request never depends on the client and the
// server happening to agree on an implicit default.
describe("startPomodoro", () => {
  afterEach(() => vi.unstubAllGlobals());

  function stubStart(expected: { todoId?: string; type: string }, response: Response) {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string, init?: RequestInit) => {
        expect(url).toBe("/api/pomodoro");
        expect(JSON.parse(init!.body as string)).toEqual(expected);
        return Promise.resolve(response);
      }),
    );
  }

  it("defaults to focus, sent explicitly, when called with no type argument", async () => {
    stubStart({ type: "focus" }, new Response(JSON.stringify({ id: "s1", userId: "u1", todoId: null, startedAt: "now", endedAt: null, durationSeconds: 1500, type: "focus" }), { status: 201 }));

    const result = await startPomodoro(null);

    expect(result.status).toBe("started");
  });

  it("sends the given type explicitly", async () => {
    stubStart(
      { type: "shortBreak" },
      new Response(JSON.stringify({ id: "s1", userId: "u1", todoId: null, startedAt: "now", endedAt: null, durationSeconds: 300, type: "shortBreak" }), { status: 201 }),
    );

    await startPomodoro(null, "shortBreak");
  });

  it("still sends todoId alongside type when both are given", async () => {
    stubStart(
      { todoId: "t1", type: "focus" },
      new Response(JSON.stringify({ id: "s1", userId: "u1", todoId: "t1", startedAt: "now", endedAt: null, durationSeconds: 1500, type: "focus" }), { status: 201 }),
    );

    await startPomodoro("t1");
  });
});
