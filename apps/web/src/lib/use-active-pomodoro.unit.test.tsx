// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PropsWithChildren } from "react";
import { POMODORO_ACTIVE_QUERY_KEY, elapsedRatio, pomodoroFinishedLabel, pomodoroSessionTypeLabel, sessionType, useActivePomodoro } from "./use-active-pomodoro.js";
import type { PomodoroSession, PomodoroSessionType } from "./pomodoro-api.js";

// waitFor's own assertion can pass while the query is still in its initial
// pending state (before the stubbed fetch above ever resolves) if the
// asserted value happens to match the loading-time default too — "idle" is
// exactly that default, so a test asserting idle must first prove the
// query actually settled, or it would pass for the wrong reason even
// against a hook with no guard at all.
async function waitForQuerySettled(queryClient: QueryClient) {
  await waitFor(() => expect(queryClient.getQueryState(POMODORO_ACTIVE_QUERY_KEY)?.status).toBe("success"));
}

// Lot 1 of the persistent-pomodoro work (see CLAUDE.md's session history):
// the server is already the source of truth for a session (startedAt +
// durationSeconds), so this hook derives phase/remainingSeconds straight
// from the cached session — never a parallel useState — and both mutations
// write that session back into the same cache key. Two consumers sharing
// one QueryClient (PomodoroCard, the header widget) can then never diverge,
// which is the whole point: see the "two simultaneous consumers" test below.
function wrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

function stubFetch(handler: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation((url: string, init?: RequestInit) => Promise.resolve(handler(url, init))),
  );
}

describe("useActivePomodoro", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("idle by default: no active session on the server means phase idle, no session, no remaining time", async () => {
    stubFetch((url) => {
      if (url === "/api/pomodoro/active") return new Response(null, { status: 404 });
      throw new Error(`unexpected fetch: ${url}`);
    });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useActivePomodoro(), { wrapper: wrapper(queryClient) });

    await waitFor(() => expect(result.current.phase).toBe("idle"));
    expect(result.current.session).toBeNull();
    expect(result.current.remainingSeconds).toBeNull();
  });

  // Production guard, not just a test-fixture fix: a cached payload this
  // hook cannot safely compute a countdown from must never reach the
  // widget/PomodoroCard as "running" with a garbage remainingSeconds
  // (NaN:NaN) — it must read as idle, the same as no session at all. This
  // is also what makes App.unit.test.tsx's own ad hoc fetch stubs (many of
  // which answer every unlisted route, /api/pomodoro/active included, with
  // a bare `[]`/200 — truthy, but not a usable session) harmless without
  // having to fix each one of them.
  it("a cached payload with no usable startedAt/durationSeconds (e.g. the bare [] many test fetch stubs default to) reads as idle, never a garbage countdown", async () => {
    stubFetch((url) => {
      if (url === "/api/pomodoro/active") return new Response(JSON.stringify([]), { status: 200 });
      throw new Error(`unexpected fetch: ${url}`);
    });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useActivePomodoro(), { wrapper: wrapper(queryClient) });
    await waitForQuerySettled(queryClient);

    expect(result.current.phase).toBe("idle");
    expect(result.current.session).toBeNull();
    expect(result.current.remainingSeconds).toBeNull();
  });

  it("a cached session missing startedAt reads as idle rather than computing NaN", async () => {
    stubFetch((url) => {
      if (url === "/api/pomodoro/active") return new Response(JSON.stringify({ id: "s1", userId: "u1", todoId: null, endedAt: null, durationSeconds: 1500 }), { status: 200 });
      throw new Error(`unexpected fetch: ${url}`);
    });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useActivePomodoro(), { wrapper: wrapper(queryClient) });
    await waitForQuerySettled(queryClient);

    expect(result.current.phase).toBe("idle");
  });

  it("a cached session with an unparseable startedAt reads as idle rather than computing NaN", async () => {
    stubFetch((url) => {
      if (url === "/api/pomodoro/active") {
        return new Response(JSON.stringify({ id: "s1", userId: "u1", todoId: null, startedAt: "not-a-date", endedAt: null, durationSeconds: 1500 }), { status: 200 });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useActivePomodoro(), { wrapper: wrapper(queryClient) });
    await waitForQuerySettled(queryClient);

    expect(result.current.phase).toBe("idle");
  });

  it("a cached session with a non-finite durationSeconds reads as idle rather than computing NaN", async () => {
    stubFetch((url) => {
      if (url === "/api/pomodoro/active") {
        return new Response(JSON.stringify({ id: "s1", userId: "u1", todoId: null, startedAt: new Date().toISOString(), endedAt: null, durationSeconds: null }), { status: 200 });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useActivePomodoro(), { wrapper: wrapper(queryClient) });
    await waitForQuerySettled(queryClient);

    expect(result.current.phase).toBe("idle");
  });

  it("resumes an already-active server session on mount: phase running, real remaining time derived from startedAt/durationSeconds", async () => {
    const startedAt = new Date(Date.now() - 60_000).toISOString();
    stubFetch((url) => {
      if (url === "/api/pomodoro/active") {
        return new Response(JSON.stringify({ id: "s1", userId: "u1", todoId: null, startedAt, endedAt: null, durationSeconds: 1500 }), { status: 200 });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useActivePomodoro(), { wrapper: wrapper(queryClient) });

    await waitFor(() => expect(result.current.phase).toBe("running"));
    expect(result.current.session?.id).toBe("s1");
    // 1500 - 60 elapsed, give or take test-runner scheduling jitter.
    expect(result.current.remainingSeconds).toBeGreaterThan(1430);
    expect(result.current.remainingSeconds).toBeLessThanOrEqual(1440);
  });

  it("start() creates a session, writes it into the shared cache, and flips phase to running", async () => {
    const startedAt = new Date().toISOString();
    stubFetch((url, init) => {
      if (url === "/api/pomodoro/active") return new Response(null, { status: 404 });
      if (url === "/api/pomodoro" && init?.method === "POST") {
        return new Response(JSON.stringify({ id: "s1", userId: "u1", todoId: null, startedAt, endedAt: null, durationSeconds: 1500 }), { status: 201 });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useActivePomodoro(), { wrapper: wrapper(queryClient) });
    await waitFor(() => expect(result.current.phase).toBe("idle"));

    const startResult = await result.current.start();

    expect(startResult.status).toBe("started");
    await waitFor(() => expect(result.current.phase).toBe("running"));
    expect(result.current.session?.id).toBe("s1");
  });

  it("start() against an already-active server session reports 'already-active' but still resyncs phase to running with the real session", async () => {
    const startedAt = new Date().toISOString();
    stubFetch((url, init) => {
      if (url === "/api/pomodoro/active") return new Response(null, { status: 404 });
      if (url === "/api/pomodoro" && init?.method === "POST") {
        return new Response(JSON.stringify({ id: "s-real", userId: "u1", todoId: null, startedAt, endedAt: null, durationSeconds: 1500 }), { status: 409 });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useActivePomodoro(), { wrapper: wrapper(queryClient) });
    await waitFor(() => expect(result.current.phase).toBe("idle"));

    const startResult = await result.current.start();

    expect(startResult.status).toBe("already-active");
    await waitFor(() => expect(result.current.phase).toBe("running"));
    expect(result.current.session?.id).toBe("s-real");
  });

  it("end() ends the session, clears the shared cache, and flips phase back to idle", async () => {
    const startedAt = new Date().toISOString();
    stubFetch((url, init) => {
      if (url === "/api/pomodoro/active") return new Response(null, { status: 404 });
      if (url === "/api/pomodoro" && init?.method === "POST") {
        return new Response(JSON.stringify({ id: "s1", userId: "u1", todoId: null, startedAt, endedAt: null, durationSeconds: 1500 }), { status: 201 });
      }
      if (url === "/api/pomodoro/s1/end" && init?.method === "POST") return new Response(null, { status: 204 });
      throw new Error(`unexpected fetch: ${url}`);
    });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useActivePomodoro(), { wrapper: wrapper(queryClient) });
    await waitFor(() => expect(result.current.phase).toBe("idle"));
    await result.current.start();
    await waitFor(() => expect(result.current.phase).toBe("running"));

    await result.current.end();

    await waitFor(() => expect(result.current.phase).toBe("idle"));
    expect(result.current.session).toBeNull();
  });

  // The actual bug this lot fixes: two consumers (PomodoroCard, the header
  // widget) reading the same shared QueryClient must never disagree, since
  // both are meant to be simultaneous, independent windows onto one
  // server-side session, not two copies that can drift.
  it("two simultaneous hook instances sharing one QueryClient never diverge: starting from one is immediately visible in the other", async () => {
    const startedAt = new Date().toISOString();
    stubFetch((url, init) => {
      if (url === "/api/pomodoro/active") return new Response(null, { status: 404 });
      if (url === "/api/pomodoro" && init?.method === "POST") {
        return new Response(JSON.stringify({ id: "s1", userId: "u1", todoId: null, startedAt, endedAt: null, durationSeconds: 1500 }), { status: 201 });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const w = wrapper(queryClient);
    const consumerA = renderHook(() => useActivePomodoro(), { wrapper: w });
    const consumerB = renderHook(() => useActivePomodoro(), { wrapper: w });
    await waitFor(() => expect(consumerA.result.current.phase).toBe("idle"));
    await waitFor(() => expect(consumerB.result.current.phase).toBe("idle"));

    await consumerA.result.current.start();

    await waitFor(() => expect(consumerA.result.current.phase).toBe("running"));
    await waitFor(() => expect(consumerB.result.current.phase).toBe("running"));
    expect(consumerB.result.current.session?.id).toBe(consumerA.result.current.session?.id);
  });
});

// type: "focus" added here (M10 Phase 2, lot 3): a mechanical fix for
// PomodoroSession's new required field — elapsedRatio is type-agnostic.
function aSession(overrides: Partial<PomodoroSession> = {}): PomodoroSession {
  return { id: "s1", userId: "u1", todoId: null, startedAt: "2026-03-01T08:00:00.000Z", endedAt: null, durationSeconds: 1500, type: "focus", ...overrides };
}

// M10 Phase 2, lot 2's own ring/arc visual: the geometry is ordinary pure-
// function testing (docs/TESTING.md's "one legitimate exception" for the
// pomodoro countdown covers the interval driving remainingSeconds, not
// this) -- no fake timers, an explicit `now` like packages/core's own
// isPomodoroActive(session, now) (packages/core/src/workspace/domain/
// pomodoro.ts), which this mirrors rather than reinvents.
describe("elapsedRatio", () => {
  it("is 0 at the exact start of a session", () => {
    const session = aSession({ startedAt: "2026-03-01T08:00:00.000Z", durationSeconds: 1500 });
    expect(elapsedRatio(session, new Date("2026-03-01T08:00:00.000Z"))).toBe(0);
  });

  it("is 0.5 exactly halfway through the window", () => {
    const session = aSession({ startedAt: "2026-03-01T08:00:00.000Z", durationSeconds: 1500 });
    expect(elapsedRatio(session, new Date("2026-03-01T08:12:30.000Z"))).toBe(0.5);
  });

  // Real, not theoretical (the prompt's own words): a backgrounded tab
  // throttles the tick interval (docs/UI.md's Aujourd'hui — pomodoro
  // note), so the first tick to actually notice zero can land well past
  // the exact instant -- the ring must read as a clean, fully-closed
  // circle then, never wrap past a full turn or read above 1.
  it("is clamped to 1 once now is past the window, however far past", () => {
    const session = aSession({ startedAt: "2026-03-01T08:00:00.000Z", durationSeconds: 1500 });
    expect(elapsedRatio(session, new Date("2026-03-01T08:25:00.000Z"))).toBe(1);
    expect(elapsedRatio(session, new Date("2026-03-01T09:00:00.000Z"))).toBe(1);
  });

  it("is never negative for a now before startedAt (clock skew)", () => {
    const session = aSession({ startedAt: "2026-03-01T08:00:00.000Z", durationSeconds: 1500 });
    expect(elapsedRatio(session, new Date("2026-03-01T07:59:00.000Z"))).toBe(0);
  });
});

// M10 Phase 2, lot 2: the countdown reaching zero is a client-derived fact
// (packages/core/src/workspace/domain/pomodoro.ts's own isPomodoroActive
// upper bound), not something the server pushes -- this hook must reach
// "finished" on its own, from the cached session plus its own tick, the
// one legitimate real-interval exception docs/TESTING.md names.
describe("useActivePomodoro — reaching zero", () => {
  it("transitions from running to finished once the real interval notices the window has elapsed, remainingSeconds 0 and elapsedRatio 1", async () => {
    const startedAt = new Date(Date.now() - 900).toISOString(); // 0.9s of a 1s session already elapsed
    stubFetch((url) => {
      if (url === "/api/pomodoro/active") return new Response(JSON.stringify({ id: "s1", userId: "u1", todoId: null, startedAt, endedAt: null, durationSeconds: 1 }), { status: 200 });
      throw new Error(`unexpected fetch: ${url}`);
    });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useActivePomodoro(), { wrapper: wrapper(queryClient) });
    await waitFor(() => expect(result.current.phase).toBe("running"));

    await waitFor(() => expect(result.current.phase).toBe("finished"), { timeout: 3000 });

    expect(result.current.remainingSeconds).toBe(0);
    expect(result.current.elapsedRatio).toBe(1);
    expect(result.current.session?.id).toBe("s1");
  });

  // The domain's own strict upper bound (packages/core/src/workspace/
  // domain/pomodoro.ts's isPomodoroActive) means GET /api/pomodoro/active
  // stops reporting an elapsed session the instant it would be re-fetched
  // -- but staleTime: Infinity means it never is. This is what actually
  // protects the finished state from disappearing: proven here by stubbing
  // the route to answer 404 on any call after the first, then confirming
  // both that phase stays "finished" (not reset to "idle") past the
  // window, and that the route was in fact never called a second time.
  it("survives past the window without reverting to idle, and without the active route ever being re-fetched", async () => {
    let calls = 0;
    const startedAt = new Date(Date.now() - 900).toISOString();
    stubFetch((url) => {
      if (url === "/api/pomodoro/active") {
        calls += 1;
        if (calls === 1) return new Response(JSON.stringify({ id: "s1", userId: "u1", todoId: null, startedAt, endedAt: null, durationSeconds: 1 }), { status: 200 });
        // A real refetch, here, would find the session's own window
        // already elapsed server-side too (isPomodoroActive's own strict
        // bound) and answer 404 -- proving this branch is never reached is
        // exactly what proves staleTime: Infinity is doing its job.
        return new Response(null, { status: 404 });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useActivePomodoro(), { wrapper: wrapper(queryClient) });
    await waitFor(() => expect(result.current.phase).toBe("running"));

    await waitFor(() => expect(result.current.phase).toBe("finished"), { timeout: 3000 });
    // Long enough past the window that a background refetch, if one ever
    // fired, would have both landed and been observed by now.
    await new Promise((resolve) => setTimeout(resolve, 500));

    expect(result.current.phase).toBe("finished");
    expect(result.current.session?.id).toBe("s1");
    expect(calls).toBe(1);
  });
});

// M10 Phase 2, lot 3.
describe("sessionType", () => {
  it("returns the session's own type when it is one of the three known values", () => {
    expect(sessionType(aSession({ type: "shortBreak" }))).toBe("shortBreak");
    expect(sessionType(aSession({ type: "longBreak" }))).toBe("longBreak");
    expect(sessionType(aSession({ type: "focus" }))).toBe("focus");
  });

  // Every session fixture across this codebase written before this lot
  // (App.unit.test.tsx, PomodoroEffects.unit.test.tsx, TodayScreen's own
  // stubs) has no `type` field at all — this is what keeps every one of
  // them reading as a focus session, unchanged, rather than crashing or
  // showing an undefined label.
  it("defaults to focus for a missing or unrecognised type", () => {
    const { type: _type, ...withoutType } = aSession();
    expect(sessionType(withoutType as PomodoroSession)).toBe("focus");
    expect(sessionType(aSession({ type: "nonsense" as PomodoroSessionType }))).toBe("focus");
  });
});

describe("pomodoroSessionTypeLabel", () => {
  it("labels each type in French, sentence case, matching TodayScreen's own tab labels", () => {
    expect(pomodoroSessionTypeLabel("focus")).toBe("Concentration");
    expect(pomodoroSessionTypeLabel("shortBreak")).toBe("Pause courte");
    expect(pomodoroSessionTypeLabel("longBreak")).toBe("Pause longue");
  });
});

describe("pomodoroFinishedLabel", () => {
  // A pause that finishes is not "a session" (the exact distinction the
  // spec calls out) — both break types share the same generic label since
  // knowing it was short or long stops mattering the instant it's over.
  it("distinguishes a finished focus session from a finished break", () => {
    expect(pomodoroFinishedLabel("focus")).toBe("Séance terminée");
    expect(pomodoroFinishedLabel("shortBreak")).toBe("Pause terminée");
    expect(pomodoroFinishedLabel("longBreak")).toBe("Pause terminée");
  });
});

describe("useActivePomodoro — start(type)", () => {
  it("defaults to focus when called with no type argument, unchanged from before this lot", async () => {
    stubFetch((url, init) => {
      if (url === "/api/pomodoro/active") return new Response(null, { status: 404 });
      if (url === "/api/pomodoro" && init?.method === "POST") {
        expect(JSON.parse(init.body as string)).toEqual({ type: "focus" });
        return new Response(JSON.stringify({ id: "s1", userId: "u1", todoId: null, startedAt: new Date().toISOString(), endedAt: null, durationSeconds: 1500, type: "focus" }), {
          status: 201,
        });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useActivePomodoro(), { wrapper: wrapper(queryClient) });
    await waitFor(() => expect(result.current.phase).toBe("idle"));

    await result.current.start();

    await waitFor(() => expect(result.current.phase).toBe("running"));
    expect(result.current.session?.type).toBe("focus");
  });

  it("starts a short break when given explicitly, and the resulting session carries that type", async () => {
    const startedAt = new Date().toISOString();
    stubFetch((url, init) => {
      if (url === "/api/pomodoro/active") return new Response(null, { status: 404 });
      if (url === "/api/pomodoro" && init?.method === "POST") {
        expect(JSON.parse(init.body as string)).toEqual({ type: "shortBreak" });
        return new Response(JSON.stringify({ id: "s1", userId: "u1", todoId: null, startedAt, endedAt: null, durationSeconds: 300, type: "shortBreak" }), { status: 201 });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useActivePomodoro(), { wrapper: wrapper(queryClient) });
    await waitFor(() => expect(result.current.phase).toBe("idle"));

    await result.current.start("shortBreak");

    await waitFor(() => expect(result.current.phase).toBe("running"));
    expect(result.current.session?.type).toBe("shortBreak");
  });
});
