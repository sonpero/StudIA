// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PropsWithChildren } from "react";
import { useActivePomodoro } from "./use-active-pomodoro.js";

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
