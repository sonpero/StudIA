// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PropsWithChildren } from "react";
import { useActivePomodoro } from "../lib/use-active-pomodoro.js";
import { PomodoroEffects } from "./PomodoroEffects.js";

// M10 Phase 2, lot 2's ÉTAPE 1: PomodoroCard and the header widget both read
// useActivePomodoro (a read-only derivation of the cached session), but only
// this one component — mounted once in App.tsx, no visible render of its own
// — carries side effects: the tab title (including the new finished-state
// title), the auto-close call once the countdown hits zero, and the chime.
// Two consumers sharing one QueryClient (mirroring PomodoroCard + the header
// widget) must never trigger the close call twice between them.
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

// A stand-in for PomodoroCard/PomodoroHeaderWidget: any other component
// mounted on the same QueryClient that merely reads the hook, the way both
// real consumers do post-lot-2 — proving PomodoroEffects is the only one
// that ever calls close.
function OtherConsumer() {
  useActivePomodoro();
  return null;
}

describe("PomodoroEffects", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    document.title = "";
  });

  it("shows the finished title once the countdown reaches zero, then restores the original title once the session auto-closes", async () => {
    document.title = "StudIA";
    let endCalls = 0;
    const startedAt = new Date(Date.now() - 900).toISOString();
    stubFetch((url, init) => {
      if (url === "/api/pomodoro/active") return new Response(JSON.stringify({ id: "s1", userId: "u1", todoId: null, startedAt, endedAt: null, durationSeconds: 1 }), { status: 200 });
      if (url === "/api/pomodoro/s1/end" && init?.method === "POST") {
        endCalls += 1;
        return new Response(null, { status: 204 });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<PomodoroEffects />, { wrapper: wrapper(queryClient) });

    await waitFor(() => expect(document.title).toMatch(/^00:0\d · StudIA$/), { timeout: 2000 });
    await waitFor(() => expect(document.title).toBe("Séance terminée · StudIA"), { timeout: 3000 });
    await waitFor(() => expect(endCalls).toBe(1));
    await waitFor(() => expect(document.title).toBe("StudIA"));
  });

  it("calls the close route exactly once, even with another consumer of the same session mounted alongside it", async () => {
    let endCalls = 0;
    const startedAt = new Date(Date.now() - 900).toISOString();
    stubFetch((url, init) => {
      if (url === "/api/pomodoro/active") return new Response(JSON.stringify({ id: "s1", userId: "u1", todoId: null, startedAt, endedAt: null, durationSeconds: 1 }), { status: 200 });
      if (url === "/api/pomodoro/s1/end" && init?.method === "POST") {
        endCalls += 1;
        return new Response(null, { status: 204 });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const w = wrapper(queryClient);
    render(
      <>
        <PomodoroEffects />
        <OtherConsumer />
        <OtherConsumer />
      </>,
      { wrapper: w },
    );

    await waitFor(() => expect(endCalls).toBe(1), { timeout: 3000 });
    // Long enough for a duplicate close call to have shown up, if the
    // migration had one of the read-only consumers also triggering it.
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(endCalls).toBe(1);
  });

  it("treats a 403 not-found close response as already-closed: no thrown error, and the title still restores", async () => {
    document.title = "StudIA";
    const startedAt = new Date(Date.now() - 900).toISOString();
    stubFetch((url, init) => {
      if (url === "/api/pomodoro/active") return new Response(JSON.stringify({ id: "s1", userId: "u1", todoId: null, startedAt, endedAt: null, durationSeconds: 1 }), { status: 200 });
      if (url === "/api/pomodoro/s1/end" && init?.method === "POST") return new Response(JSON.stringify({ error: "not-found" }), { status: 403 });
      throw new Error(`unexpected fetch: ${url}`);
    });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<PomodoroEffects />, { wrapper: wrapper(queryClient) });

    await waitFor(() => expect(document.title).toBe("Séance terminée · StudIA"), { timeout: 3000 });
    await waitFor(() => expect(document.title).toBe("StudIA"), { timeout: 3000 });
  });

  // M10 Phase 2, lot 3: a finished break is not "a session" — the tab title
  // gets the same type-aware adaptation as PomodoroCard's own finished text.
  it("shows a break-specific finished title, not the focus one, for a short break reaching zero", async () => {
    document.title = "StudIA";
    const startedAt = new Date(Date.now() - 900).toISOString();
    stubFetch((url, init) => {
      if (url === "/api/pomodoro/active") {
        return new Response(JSON.stringify({ id: "s1", userId: "u1", todoId: null, startedAt, endedAt: null, durationSeconds: 1, type: "shortBreak" }), { status: 200 });
      }
      if (url === "/api/pomodoro/s1/end" && init?.method === "POST") return new Response(null, { status: 204 });
      throw new Error(`unexpected fetch: ${url}`);
    });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<PomodoroEffects />, { wrapper: wrapper(queryClient) });

    await waitFor(() => expect(document.title).toBe("Pause terminée · StudIA"), { timeout: 3000 });
    await waitFor(() => expect(document.title).toBe("StudIA"), { timeout: 3000 });
  });

  it("restores the original title on unmount, even mid-session", async () => {
    document.title = "StudIA";
    const startedAt = new Date().toISOString();
    stubFetch((url) => {
      if (url === "/api/pomodoro/active") return new Response(JSON.stringify({ id: "s1", userId: "u1", todoId: null, startedAt, endedAt: null, durationSeconds: 1500 }), { status: 200 });
      throw new Error(`unexpected fetch: ${url}`);
    });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { unmount } = render(<PomodoroEffects />, { wrapper: wrapper(queryClient) });

    await waitFor(() => expect(document.title).toMatch(/^\d{2}:\d{2} · StudIA$/));

    unmount();

    expect(document.title).toBe("StudIA");
  });
});
