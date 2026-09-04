// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PomodoroCard } from "./PomodoroCard.js";
import type { Todo } from "../lib/today-api.js";

const TODO_A: Todo = { id: "todo-1", label: "Réviser le chapitre 3", dueDate: null, documentId: null, done: false, source: "manual", createdAt: "2026-03-01T00:00:00.000Z" };
const DONE_TODO: Todo = { id: "todo-2", label: "Déjà fait", dueDate: null, documentId: null, done: true, source: "manual", createdAt: "2026-03-01T00:00:00.000Z" };

function renderCard(todos: Todo[] = [TODO_A, DONE_TODO]) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <PomodoroCard todos={todos} />
    </QueryClientProvider>,
  );
}

type FetchHandlers = {
  active?: () => Response;
  start?: (body: unknown) => Response;
  end?: () => Response;
};

function stubFetch(handlers: FetchHandlers) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (url === "/api/pomodoro/active") {
        return Promise.resolve(handlers.active ? handlers.active() : new Response(null, { status: 404 }));
      }
      if (url === "/api/pomodoro" && init?.method === "POST") {
        const body: unknown = init.body ? JSON.parse(init.body as string) : {};
        return Promise.resolve(handlers.start ? handlers.start(body) : new Response(null, { status: 500 }));
      }
      if (typeof url === "string" && url.endsWith("/end") && init?.method === "POST") {
        return Promise.resolve(handlers.end ? handlers.end() : new Response(null, { status: 204 }));
      }
      throw new Error(`Unhandled fetch: ${String(url)}`);
    }),
  );
}

function session(overrides: Partial<{ id: string; todoId: string | null; startedAt: string; endedAt: string | null; durationSeconds: number }> = {}) {
  return {
    id: "session-1",
    userId: "user-1",
    todoId: null,
    startedAt: new Date().toISOString(),
    endedAt: null,
    durationSeconds: 1500,
    ...overrides,
  };
}

describe("PomodoroCard", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("repos: no active session on mount shows the todo select (done todos excluded) and Démarrer", async () => {
    stubFetch({});
    renderCard();
    await screen.findByRole("button", { name: "Démarrer" });
    expect(screen.getByText("Réviser le chapitre 3")).toBeInTheDocument();
    expect(screen.queryByText("Déjà fait")).not.toBeInTheDocument();
  });

  it("repos -> en cours: clicking Démarrer with no todo selected posts an empty body and shows a fresh countdown", async () => {
    stubFetch({ start: () => new Response(JSON.stringify(session()), { status: 201 }) });
    renderCard();
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Démarrer" }));
    await screen.findByRole("button", { name: "Terminer" });
    expect(screen.getByText("25:00")).toBeInTheDocument();
    expect(screen.queryByText(/^sur /)).not.toBeInTheDocument();
    expect(screen.queryByText(/déjà en cours/i)).not.toBeInTheDocument();
  });

  it("sends the selected todo's id when starting, and shows it as the linked todo once running", async () => {
    let sentBody: unknown;
    stubFetch({
      start: (body) => {
        sentBody = body;
        return new Response(JSON.stringify(session({ todoId: "todo-1" })), { status: 201 });
      },
    });
    renderCard();
    const user = userEvent.setup();
    await user.selectOptions(await screen.findByLabelText(/todo/i), "todo-1");
    await user.click(screen.getByRole("button", { name: "Démarrer" }));
    await screen.findByRole("button", { name: "Terminer" });
    expect(sentBody).toEqual({ todoId: "todo-1" });
    expect(screen.getByText("sur « Réviser le chapitre 3 »")).toBeInTheDocument();
  });

  it("mount resume: an active session (200) renders running directly, with no resync notice", async () => {
    stubFetch({ active: () => new Response(JSON.stringify(session({ todoId: "todo-1", startedAt: new Date(Date.now() - 60_000).toISOString() })), { status: 200 }) });
    renderCard();
    await screen.findByRole("button", { name: "Terminer" });
    expect(screen.getByText("sur « Réviser le chapitre 3 »")).toBeInTheDocument();
    expect(screen.queryByText(/déjà en cours/i)).not.toBeInTheDocument();
  });

  it("a todo deleted mid-session (its id no longer in the todos list) renders as if none had ever been linked, without crashing", async () => {
    stubFetch({ active: () => new Response(JSON.stringify(session({ todoId: "todo-deleted" })), { status: 200 }) });
    renderCard([TODO_A]); // "todo-deleted" is absent from this list
    await screen.findByRole("button", { name: "Terminer" });
    expect(screen.queryByText(/^sur /)).not.toBeInTheDocument();
  });

  it("409: refuses to start a second session, resumes the already-active one, and shows a discreet resync line", async () => {
    stubFetch({ start: () => new Response(JSON.stringify(session({ startedAt: new Date(Date.now() - 300_000).toISOString() })), { status: 409 }) });
    renderCard();
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Démarrer" }));
    await screen.findByRole("button", { name: "Terminer" });
    expect(screen.getByText("Une séance est déjà en cours.")).toBeInTheDocument();
  });

  it("countdown ticks down once per second, derived from startedAt, and freezes at 00:00 without auto-finishing", async () => {
    // findBy*/waitFor poll via real setTimeout internally, which fake
    // timers would freeze — advanceTimersByTimeAsync(0) flushes the mount
    // fetch's pending promises instead, so every assertion below can stay
    // synchronous (getByText) rather than racing testing-library's own
    // polling against the fake clock.
    vi.useFakeTimers();
    const now = new Date("2026-03-02T10:00:00.000Z");
    vi.setSystemTime(now);
    stubFetch({ active: () => new Response(JSON.stringify(session({ startedAt: new Date(now.getTime() - 60_000).toISOString(), durationSeconds: 90 })), { status: 200 }) });
    renderCard();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByText("00:30")).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(screen.getByText("00:29")).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(screen.getByText("00:00")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Terminer" })).toBeInTheDocument();
  });

  it("juste terminée: the confirmation line appears only once the end call actually resolves, never before, and is built from the session already in hand", async () => {
    let resolveEnd!: (res: Response) => void;
    stubFetch({
      active: () => new Response(JSON.stringify(session({ todoId: "todo-1", durationSeconds: 1500 })), { status: 200 }),
      end: () => new Response(null, { status: 204 }),
    });
    renderCard();
    await screen.findByRole("button", { name: "Terminer" });

    // Replace the end handler with a controllable promise to prove the
    // confirmation line waits for the real response.
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string, init?: RequestInit) => {
        if (typeof url === "string" && url.endsWith("/end") && init?.method === "POST") {
          return new Promise<Response>((resolve) => {
            resolveEnd = resolve;
          });
        }
        throw new Error(`Unhandled fetch after stub swap: ${String(url)}`);
      }),
    );

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Terminer" }));
    expect(screen.queryByText(/séance terminée/i)).not.toBeInTheDocument();

    resolveEnd(new Response(null, { status: 204 }));
    await screen.findByText(/séance terminée/i);
    expect(screen.getByText(/25 minutes/)).toBeInTheDocument();
    expect(screen.getByText(/sur « Réviser le chapitre 3 »/)).toBeInTheDocument();
  });

  it("juste terminée: omits the linked-todo mention when the todo can no longer be resolved", async () => {
    stubFetch({
      active: () => new Response(JSON.stringify(session({ todoId: "todo-gone", durationSeconds: 1500 })), { status: 200 }),
      end: () => new Response(null, { status: 204 }),
    });
    renderCard([TODO_A]);
    await screen.findByRole("button", { name: "Terminer" });
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Terminer" }));
    await screen.findByText(/séance terminée/i);
    expect(screen.queryByText(/^sur /)).not.toBeInTheDocument();
  });
});
