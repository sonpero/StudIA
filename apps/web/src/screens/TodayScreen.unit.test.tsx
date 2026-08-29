// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TodayScreen } from "./TodayScreen.js";
import type { TodayView } from "../lib/today-api.js";

function renderScreen() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <TodayScreen onBack={() => undefined} />
    </QueryClientProvider>,
  );
}

function stubFetch(view: TodayView | (() => Response)) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation(() => {
      if (typeof view === "function") return Promise.resolve(view());
      return Promise.resolve(new Response(JSON.stringify(view), { status: 200 }));
    }),
  );
}

const emptyView: TodayView = { date: "2026-03-02", dueCards: [], notionsBelowTarget: [], todos: [], upcomingDeadlines: [] };

describe("TodayScreen", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("loading state: shows a skeleton, never a bare spinner", () => {
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(new Promise(() => {})));
    renderScreen();
    expect(screen.getByRole("heading", { name: "Aujourd'hui" })).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("error state: a network failure shows the confused mascot and a retry button, never a raw error code", async () => {
    stubFetch(() => new Response(null, { status: 500 }));
    renderScreen();
    await screen.findByText(/impossible de charger/i);
    expect(screen.getByRole("button", { name: /réessayer/i })).toBeInTheDocument();
  });

  it("empty state: nothing due, nothing behind, no todos, no deadlines — an invitation, never a bare '0'", async () => {
    stubFetch(emptyView);
    renderScreen();
    await screen.findByText(/rien de prévu/i);
    expect(screen.queryByText(/^0$/)).not.toBeInTheDocument();
  });

  it("ready: shows due cards grouped by course", async () => {
    stubFetch({ ...emptyView, dueCards: [{ documentId: "doc-1", documentTitle: "Maths", colour: "#F87171", count: 3 }] });
    renderScreen();
    await screen.findByText("Maths");
    expect(screen.getByText(/3/)).toBeInTheDocument();
  });

  it("ready: shows notions below target grouped by course", async () => {
    stubFetch({ ...emptyView, notionsBelowTarget: [{ documentId: "doc-1", documentTitle: "Histoire", colour: "#60A5FA", count: 2 }] });
    renderScreen();
    await screen.findByText("Histoire");
    expect(screen.getByText(/2 notions?/)).toBeInTheDocument();
  });

  it("ready: shows upcoming deadlines as a plain fact, never a countdown widget", async () => {
    stubFetch({ ...emptyView, upcomingDeadlines: [{ documentId: "doc-1", title: "Maths", deadlineDate: "2026-03-12", deadlineLabel: "Contrôle", daysAway: 10 }] });
    renderScreen();
    await screen.findByText(/10 jours/i);
    expect(screen.queryByRole("timer")).not.toBeInTheDocument();
  });

  it("ready: lists existing todos, read-only — no checkbox or button to toggle them yet", async () => {
    stubFetch({
      ...emptyView,
      todos: [{ id: "t1", label: "Réviser le chapitre 3", dueDate: null, documentId: null, done: false, source: "manual", createdAt: "2026-03-01T00:00:00.000Z" }],
    });
    renderScreen();
    await screen.findByText("Réviser le chapitre 3");
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /ajouter/i })).not.toBeInTheDocument();
  });

  it("ready: a done todo is visually distinguished from a pending one", async () => {
    stubFetch({
      ...emptyView,
      todos: [
        { id: "t1", label: "Fait", dueDate: null, documentId: null, done: true, source: "manual", createdAt: "2026-03-01T00:00:00.000Z" },
        { id: "t2", label: "À faire", dueDate: null, documentId: null, done: false, source: "manual", createdAt: "2026-03-01T00:00:00.000Z" },
      ],
    });
    renderScreen();
    const done = await screen.findByText("Fait");
    const pending = await screen.findByText("À faire");
    expect(done).toHaveClass("line-through");
    expect(pending).not.toHaveClass("line-through");
  });

  it("no mascot in the ready state: this is a data-dense view (docs/UI.md)", async () => {
    stubFetch({ ...emptyView, todos: [{ id: "t1", label: "x", dueDate: null, documentId: null, done: false, source: "manual", createdAt: "2026-03-01T00:00:00.000Z" }] });
    renderScreen();
    await screen.findByText("x");
    expect(document.querySelectorAll("svg[aria-hidden='true']")).toHaveLength(0);
  });
});
