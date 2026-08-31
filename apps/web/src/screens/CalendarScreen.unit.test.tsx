// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CalendarScreen } from "./CalendarScreen.js";
import type { CalendarView } from "../lib/calendar-api.js";

function renderScreen(overrides: Partial<{ onOpenCourse: (documentId: string) => void }> = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <CalendarScreen onOpenCourse={overrides.onOpenCourse ?? (() => undefined)} />
    </QueryClientProvider>,
  );
}

const emptyView = (start: string, end: string): CalendarView => ({ start, end, days: [] });

// today is fixed mid-month throughout, so the browsed month on first
// render is always March 2026 unless a test navigates away from it.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 2, 15));
});

function stubFetch(handlers: { calendar?: (start: string, end: string) => CalendarView; documents?: { id: string; title: string; colour: string }[] }) {
  const calendarCalls: { start: string; end: string }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation((url: string) => {
      if (typeof url === "string" && url.startsWith("/api/calendar")) {
        const params = new URLSearchParams(url.split("?")[1]);
        const start = params.get("start")!;
        const end = params.get("end")!;
        calendarCalls.push({ start, end });
        const view = handlers.calendar?.(start, end) ?? emptyView(start, end);
        return Promise.resolve(new Response(JSON.stringify(view), { status: 200 }));
      }
      if (typeof url === "string" && url.startsWith("/api/documents")) {
        return Promise.resolve(new Response(JSON.stringify(handlers.documents ?? []), { status: 200 }));
      }
      return Promise.resolve(new Response(null, { status: 404 }));
    }),
  );
  return calendarCalls;
}

describe("CalendarScreen", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("loading state: shows the month heading and a skeleton grid, never a bare spinner", () => {
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(new Promise(() => {})));
    renderScreen();
    expect(screen.getByRole("heading", { name: "Mars 2026" })).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("error state: a network failure shows the confused mascot and a retry button", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 500 })));
    renderScreen();
    await screen.findByText(/impossible de charger/i);
    expect(screen.getByRole("button", { name: /réessayer/i })).toBeInTheDocument();
  });

  it("the gap between the heading row (or the title) and what follows it is the same --space-section token in every state (docs/UI.md's Grid and spacing note)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(new Promise(() => {})));
    renderScreen();
    const loadingMain = screen.getByRole("heading", { name: "Mars 2026" }).closest("main");
    expect(loadingMain?.className).toMatch(/gap-\[var\(--space-section\)\]/);
    cleanup();

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 500 })));
    renderScreen();
    await screen.findByText(/impossible de charger/i);
    const errorMain = screen.getByRole("heading", { name: "Calendrier" }).closest("main");
    expect(errorMain?.className).toMatch(/gap-\[var\(--space-section\)\]/);
    cleanup();

    stubFetch({});
    renderScreen();
    await screen.findByTestId("calendar-grid");
    const readyMain = screen.getByRole("heading", { name: "Mars 2026" }).closest("main");
    expect(readyMain?.className).toMatch(/gap-\[var\(--space-section\)\]/);
  });

  it("ready: an entirely empty month still renders the grid, never a mascot", async () => {
    stubFetch({});
    renderScreen();
    await screen.findByTestId("calendar-grid");

    expect(screen.getByTestId("calendar-grid")).toBeInTheDocument();
    expect(document.querySelectorAll("svg[data-testid='mascot']")).toHaveLength(0);
  });

  it("a day with 3 entries or fewer renders one dot per entry, no count badge", async () => {
    stubFetch({
      calendar: (start, end) => ({
        start,
        end,
        days: [{ date: "2026-03-10", entries: [{ kind: "deadline", id: "d1", title: "Maths", documentId: "doc-1", colour: "#F87171", done: null }] }],
      }),
    });
    renderScreen();
    await screen.findByTestId("calendar-grid");

    const cell = screen.getByTestId("calendar-day-2026-03-10");
    expect(within(cell).getAllByRole("img")).toHaveLength(1);
    expect(within(cell).queryByText(/^\+/)).not.toBeInTheDocument();
  });

  it("a day with exactly 3 entries renders 3 dots, no badge — the boundary the overflow rule turns on", async () => {
    stubFetch({
      calendar: (start, end) => ({
        start,
        end,
        days: [
          {
            date: "2026-03-10",
            entries: [
              { kind: "deadline", id: "d1", title: "Maths", documentId: "doc-1", colour: "#F87171", done: null },
              { kind: "todo", id: "t1", title: "Réviser", documentId: null, colour: null, done: false },
              { kind: "todo", id: "t2", title: "Rendre le devoir", documentId: null, colour: null, done: false },
            ],
          },
        ],
      }),
    });
    renderScreen();
    await screen.findByTestId("calendar-grid");

    const cell = screen.getByTestId("calendar-day-2026-03-10");
    expect(within(cell).getAllByRole("img")).toHaveLength(3);
    expect(within(cell).queryByText(/^\+/)).not.toBeInTheDocument();
  });

  it("a day with 4 or more entries renders 2 dots and a '+N' count, not one dot each", async () => {
    stubFetch({
      calendar: (start, end) => ({
        start,
        end,
        days: [
          {
            date: "2026-03-10",
            entries: [
              { kind: "deadline", id: "d1", title: "Maths", documentId: "doc-1", colour: "#F87171", done: null },
              { kind: "todo", id: "t1", title: "Un", documentId: null, colour: null, done: false },
              { kind: "todo", id: "t2", title: "Deux", documentId: null, colour: null, done: false },
              { kind: "todo", id: "t3", title: "Trois", documentId: null, colour: null, done: false },
            ],
          },
        ],
      }),
    });
    renderScreen();
    await screen.findByTestId("calendar-grid");

    const cell = screen.getByTestId("calendar-day-2026-03-10");
    expect(within(cell).getAllByRole("img")).toHaveLength(2);
    expect(within(cell).getByText("+2")).toBeInTheDocument();
  });

  it("a course-less todo's dot is named 'Todo sans cours', never a colour it doesn't have", async () => {
    stubFetch({
      calendar: (start, end) => ({ start, end, days: [{ date: "2026-03-10", entries: [{ kind: "todo", id: "t1", title: "Réviser", documentId: null, colour: null, done: false }] }] }),
    });
    renderScreen();
    await screen.findByTestId("calendar-grid");

    expect(within(screen.getByTestId("calendar-day-2026-03-10")).getByRole("img", { name: "Todo sans cours" })).toBeInTheDocument();
  });

  it("a course-linked entry's dot is named after the course, resolved from the documents list", async () => {
    stubFetch({
      calendar: (start, end) => ({
        start,
        end,
        days: [{ date: "2026-03-10", entries: [{ kind: "todo", id: "t1", title: "Rendre le devoir", documentId: "doc-1", colour: "#F87171", done: false }] }],
      }),
      documents: [{ id: "doc-1", title: "Maths", colour: "#F87171" }],
    });
    renderScreen();
    await screen.findByTestId("calendar-grid");

    expect(within(screen.getByTestId("calendar-day-2026-03-10")).getByRole("img", { name: "Maths" })).toBeInTheDocument();
  });

  it("marks today's cell distinctly, as a place marker, not a warning", async () => {
    stubFetch({});
    renderScreen();
    await screen.findByTestId("calendar-grid");

    expect(screen.getByTestId("calendar-day-2026-03-15")).toHaveAttribute("aria-current", "date");
    expect(screen.getByTestId("calendar-day-2026-03-10")).not.toHaveAttribute("aria-current");
  });

  it("the leading and trailing filler days from adjacent months render but are not clickable", async () => {
    stubFetch({});
    renderScreen();
    await screen.findByTestId("calendar-grid");

    const fillers = screen.getAllByTestId("calendar-filler-day");
    expect(fillers.length).toBeGreaterThan(0);
    for (const filler of fillers) expect(filler.tagName).not.toBe("BUTTON");
    // 2026-03-01 is a Sunday: six leading days from February (23-28)
    // complete the grid's first Monday-first week — the very first grid
    // cell is the first of those, 2026-02-23.
    expect(fillers[0]).toHaveTextContent("23");
  });

  it("month navigation: 'Mois suivant' fetches the displayed month's own bounds, not the real current month's", async () => {
    const calls = stubFetch({});
    const user = userEvent.setup();
    renderScreen();
    await screen.findByTestId("calendar-grid");
    expect(calls).toContainEqual({ start: "2026-03-01", end: "2026-03-31" });

    await user.click(screen.getByRole("button", { name: /mois suivant/i }));
    await screen.findByRole("heading", { name: "Avril 2026" });

    expect(calls).toContainEqual({ start: "2026-04-01", end: "2026-04-30" });
    // Never re-requests March once April is displayed and today (still
    // 2026-03-15, unmoved) has not changed — a bug here would keep
    // re-sending the real current month regardless of navigation.
    expect(calls.filter((c) => c.start === "2026-03-01")).toHaveLength(1);
  });

  it("month navigation: 'Mois précédent' fetches the previous month's bounds, crossing a year boundary correctly from January", async () => {
    const calls = stubFetch({});
    const user = userEvent.setup();
    renderScreen();
    await screen.findByTestId("calendar-grid");

    await user.click(screen.getByRole("button", { name: /mois précédent/i }));
    await screen.findByRole("heading", { name: "Février 2026" });
    expect(calls).toContainEqual({ start: "2026-02-01", end: "2026-02-28" });

    await user.click(screen.getByRole("button", { name: /mois précédent/i }));
    await user.click(screen.getByRole("button", { name: /mois précédent/i }));
    await screen.findByRole("heading", { name: "Décembre 2025" });
    expect(calls).toContainEqual({ start: "2025-12-01", end: "2025-12-31" });
  });

  it("no day selected initially: the panel shows a neutral prompt, not a blank area", async () => {
    stubFetch({});
    renderScreen();
    await screen.findByTestId("calendar-grid");

    expect(screen.getByText(/sélectionne un jour/i)).toBeInTheDocument();
  });

  it("clicking an empty day shows a plain 'nothing that day' message, not a blank panel", async () => {
    stubFetch({});
    const user = userEvent.setup();
    renderScreen();
    await screen.findByTestId("calendar-grid");

    await user.click(screen.getByTestId("calendar-day-2026-03-10"));

    expect(screen.getByText(/rien ce jour-là/i)).toBeInTheDocument();
  });

  it("clicking a day shows every entry uncapped: a deadline with 'Voir le cours', a todo read-only", async () => {
    const onOpenCourse = vi.fn();
    stubFetch({
      calendar: (start, end) => ({
        start,
        end,
        days: [
          {
            date: "2026-03-10",
            entries: [
              { kind: "deadline", id: "d1", title: "Maths", documentId: "doc-1", colour: "#F87171", done: null },
              { kind: "todo", id: "t1", title: "Réviser le chapitre 3", documentId: null, colour: null, done: false },
            ],
          },
        ],
      }),
    });
    const user = userEvent.setup();
    renderScreen({ onOpenCourse });
    await screen.findByTestId("calendar-grid");

    await user.click(screen.getByTestId("calendar-day-2026-03-10"));

    const panel = screen.getByTestId("day-panel");
    expect(within(panel).getByText("Maths")).toBeInTheDocument();
    expect(within(panel).getByText("Réviser le chapitre 3")).toBeInTheDocument();
    expect(within(panel).queryByRole("checkbox")).not.toBeInTheDocument();

    await user.click(within(panel).getByRole("button", { name: "Voir le cours" }));
    expect(onOpenCourse).toHaveBeenCalledWith("doc-1");
  });

  it("a done todo in the day panel appears struck through, matching Aujourd'hui's own treatment", async () => {
    stubFetch({
      calendar: (start, end) => ({ start, end, days: [{ date: "2026-03-10", entries: [{ kind: "todo", id: "t1", title: "Fait", documentId: null, colour: null, done: true }] }] }),
    });
    const user = userEvent.setup();
    renderScreen();
    await screen.findByTestId("calendar-grid");

    await user.click(screen.getByTestId("calendar-day-2026-03-10"));

    expect(within(screen.getByTestId("day-panel")).getByText("Fait")).toHaveClass("line-through");
  });

  it("never shows a confirmation dialog when viewing or navigating a day", async () => {
    stubFetch({
      calendar: (start, end) => ({ start, end, days: [{ date: "2026-03-10", entries: [{ kind: "deadline", id: "d1", title: "Maths", documentId: "doc-1", colour: "#F87171", done: null }] }] }),
    });
    const user = userEvent.setup();
    renderScreen();
    await screen.findByTestId("calendar-grid");

    await user.click(screen.getByTestId("calendar-day-2026-03-10"));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
