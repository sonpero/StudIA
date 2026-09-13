// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CalendarScreen } from "./CalendarScreen.js";
import type { CalendarView } from "../lib/calendar-api.js";
import type { ProgressListItem } from "../lib/progress-api.js";

function renderScreen(overrides: Partial<{ onOpenCourse: (documentId: string) => void }> = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <CalendarScreen onOpenCourse={overrides.onOpenCourse ?? (() => undefined)} />
    </QueryClientProvider>,
  );
}

const emptyView = (start: string, end: string): CalendarView => ({ start, end, days: [] });

const noProgress = (): CourseProgress => ({ coverage: 0, readiness: 0, status: "no-deadline", behindByNotions: 0, recentlyAddedUnreviewed: 0 });
type CourseProgress = ProgressListItem["progress"];

function progressItem(overrides: Partial<ProgressListItem> & { documentId: string; title: string }): ProgressListItem {
  return { colour: "#0f7b5f", deadlineDate: null, deadlineLabel: null, progress: noProgress(), ...overrides };
}

// today is fixed mid-month throughout, so the browsed month on first
// render is always March 2026 unless a test navigates away from it.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 2, 15));
});

function stubFetch(handlers: { calendar?: (start: string, end: string) => CalendarView; progress?: ProgressListItem[] }) {
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
      if (typeof url === "string" && url.startsWith("/api/course-progress")) {
        return Promise.resolve(new Response(JSON.stringify(handlers.progress ?? []), { status: 200 }));
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

  it("loading state: shows the page title, the month heading and a skeleton grid, never a bare spinner", () => {
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(new Promise(() => {})));
    renderScreen();
    expect(screen.getByRole("heading", { name: "Agenda" })).toBeInTheDocument();
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
    const loadingMain = screen.getByRole("heading", { name: "Agenda" }).closest("main");
    expect(loadingMain?.className).toMatch(/gap-\[var\(--space-section\)\]/);
    cleanup();

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 500 })));
    renderScreen();
    await screen.findByText(/impossible de charger/i);
    const errorMain = screen.getByRole("heading", { name: "Agenda" }).closest("main");
    expect(errorMain?.className).toMatch(/gap-\[var\(--space-section\)\]/);
    cleanup();

    stubFetch({});
    renderScreen();
    await screen.findByTestId("calendar-grid");
    const readyMain = screen.getByRole("heading", { name: "Agenda" }).closest("main");
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
        days: [
          {
            date: "2026-03-10",
            entries: [
              { kind: "todo", id: "t1", title: "Réviser", documentId: "doc-1", colour: "#F87171", done: false },
              { kind: "todo", id: "t2", title: "Rendre le devoir", documentId: null, colour: null, done: false },
            ],
          },
        ],
      }),
    });
    renderScreen();
    await screen.findByTestId("calendar-grid");

    const cell = screen.getByTestId("calendar-day-2026-03-10");
    expect(within(cell).getAllByRole("img")).toHaveLength(2);
    expect(within(cell).queryByText(/^\+/)).not.toBeInTheDocument();
  });

  it("a day with a single deadline and nothing else shows the course as a coloured name badge, not a bare dot", async () => {
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
    expect(within(cell).getByText("Maths")).toBeInTheDocument();
    expect(within(cell).queryAllByRole("img")).toHaveLength(0);
  });

  it("the deadline badge spans the full width of its day cell, not just its own text width", async () => {
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
    const badge = within(cell).getByText("Maths").closest("span[class*='rounded-full']");
    expect(badge?.className).toContain("self-stretch");
  });

  it("the deadline badge's course name is resolved from the course-progress list, same as a dot's accessible name", async () => {
    stubFetch({
      calendar: (start, end) => ({
        start,
        end,
        days: [{ date: "2026-03-10", entries: [{ kind: "deadline", id: "d1", title: "Ancien nom", documentId: "doc-1", colour: "#F87171", done: null }] }],
      }),
      progress: [progressItem({ documentId: "doc-1", title: "Nouveau nom", colour: "#F87171" })],
    });
    renderScreen();
    await screen.findByTestId("calendar-grid");

    const cell = screen.getByTestId("calendar-day-2026-03-10");
    expect(within(cell).getByText("Nouveau nom")).toBeInTheDocument();
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

  it("a course-linked entry's dot is named after the course, resolved from the course-progress list", async () => {
    stubFetch({
      calendar: (start, end) => ({
        start,
        end,
        days: [{ date: "2026-03-10", entries: [{ kind: "todo", id: "t1", title: "Rendre le devoir", documentId: "doc-1", colour: "#F87171", done: false }] }],
      }),
      progress: [progressItem({ documentId: "doc-1", title: "Maths", colour: "#F87171" })],
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

  it("month navigation buttons are icon-only (a deliberate reversal of docs/UI.md's own rule, like the streak/countdown ones): no visible text, an svg icon, the label carried by aria-label alone", async () => {
    stubFetch({});
    renderScreen();
    await screen.findByTestId("calendar-grid");

    const previous = screen.getByRole("button", { name: "Mois précédent" });
    const next = screen.getByRole("button", { name: "Mois suivant" });
    expect(previous).toHaveAttribute("aria-label", "Mois précédent");
    expect(previous.textContent).toBe("");
    expect(previous.querySelector("svg")).toBeInTheDocument();
    expect(next).toHaveAttribute("aria-label", "Mois suivant");
    expect(next.textContent).toBe("");
    expect(next.querySelector("svg")).toBeInTheDocument();
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

  it("day panel: 'Voir le cours' carries the light green tint (--primary-soft), the same secondary-with-tint idiom Progrès' own button uses", async () => {
    stubFetch({
      calendar: (start, end) => ({
        start,
        end,
        days: [{ date: "2026-03-10", entries: [{ kind: "deadline", id: "d1", title: "Maths", documentId: "doc-1", colour: "#F87171", done: null }] }],
      }),
    });
    const user = userEvent.setup();
    renderScreen();
    await screen.findByTestId("calendar-grid");

    await user.click(screen.getByTestId("calendar-day-2026-03-10"));

    const button = within(screen.getByTestId("day-panel")).getByRole("button", { name: "Voir le cours" });
    expect(button.className).toContain("bg-primary-soft");
  });

  it("day panel: each entry's leading marker is an icon in a tinted circle (the entry's own colour), not a bare dot", async () => {
    stubFetch({
      calendar: (start, end) => ({
        start,
        end,
        days: [{ date: "2026-03-10", entries: [{ kind: "deadline", id: "d1", title: "Maths", documentId: "doc-1", colour: "#F87171", done: null }] }],
      }),
    });
    const user = userEvent.setup();
    renderScreen();
    await screen.findByTestId("calendar-grid");

    await user.click(screen.getByTestId("calendar-day-2026-03-10"));

    const icon = within(screen.getByTestId("day-panel")).getByTestId("calendar-entry-icon");
    expect(icon).toHaveStyle({ backgroundColor: "#F8717126" });
    expect(icon.querySelector("svg")).toBeInTheDocument();
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

  describe("Prochaines échéances sidebar", () => {
    it("empty: no course has a future deadline shows a plain-fact message, not a mascot", async () => {
      stubFetch({ progress: [progressItem({ documentId: "doc-1", title: "Maths" })] });
      renderScreen();
      await screen.findByTestId("calendar-grid");

      expect(within(screen.getByTestId("upcoming-deadlines")).getByText(/aucune échéance à venir/i)).toBeInTheDocument();
    });

    it("lists only future-or-today deadlines, soonest first, a past one excluded", async () => {
      stubFetch({
        progress: [
          progressItem({ documentId: "doc-past", title: "Histoire", deadlineDate: "2026-03-01" }),
          progressItem({ documentId: "doc-later", title: "SVT", deadlineDate: "2026-03-25" }),
          progressItem({ documentId: "doc-soon", title: "Maths", deadlineDate: "2026-03-18" }),
        ],
      });
      renderScreen();
      await screen.findByTestId("calendar-grid");

      const rows = within(screen.getByTestId("upcoming-deadlines")).getAllByTestId("upcoming-deadline-row");
      expect(rows).toHaveLength(2);
      expect(within(rows[0]!).getByText("Maths")).toBeInTheDocument();
      expect(within(rows[1]!).getByText("SVT")).toBeInTheDocument();
      expect(within(screen.getByTestId("upcoming-deadlines")).queryByText("Histoire")).not.toBeInTheDocument();
    });

    it("caps the list at four, the soonest four when more courses have a deadline", async () => {
      stubFetch({
        progress: [
          progressItem({ documentId: "doc-1", title: "Un", deadlineDate: "2026-03-16" }),
          progressItem({ documentId: "doc-2", title: "Deux", deadlineDate: "2026-03-17" }),
          progressItem({ documentId: "doc-3", title: "Trois", deadlineDate: "2026-03-18" }),
          progressItem({ documentId: "doc-4", title: "Quatre", deadlineDate: "2026-03-19" }),
          progressItem({ documentId: "doc-5", title: "Cinq", deadlineDate: "2026-03-20" }),
        ],
      });
      renderScreen();
      await screen.findByTestId("calendar-grid");

      const panel = screen.getByTestId("upcoming-deadlines");
      expect(within(panel).getAllByTestId("upcoming-deadline-row")).toHaveLength(4);
      expect(within(panel).queryByText("Cinq")).not.toBeInTheDocument();
    });

    it("a same-day deadline reads 'Examen aujourd'hui', not 'dans 0 jours'", async () => {
      stubFetch({ progress: [progressItem({ documentId: "doc-1", title: "Maths", deadlineDate: "2026-03-15" })] });
      renderScreen();
      await screen.findByTestId("calendar-grid");

      expect(within(screen.getByTestId("upcoming-deadlines")).getByText("Examen aujourd'hui")).toBeInTheDocument();
    });

    it("clicking a row navigates to that course, same as the day panel's own 'Voir le cours'", async () => {
      const onOpenCourse = vi.fn();
      stubFetch({ progress: [progressItem({ documentId: "doc-1", title: "Maths", deadlineDate: "2026-03-18" })] });
      const user = userEvent.setup();
      renderScreen({ onOpenCourse });
      await screen.findByTestId("calendar-grid");

      await user.click(within(screen.getByTestId("upcoming-deadlines")).getByTestId("upcoming-deadline-row"));

      expect(onOpenCourse).toHaveBeenCalledWith("doc-1");
    });
  });

  describe("'Aller à aujourd'hui'", () => {
    it("jumps back to the real current month and selects today, from a different browsed month", async () => {
      stubFetch({});
      const user = userEvent.setup();
      renderScreen();
      await screen.findByTestId("calendar-grid");

      await user.click(screen.getByRole("button", { name: /mois suivant/i }));
      await screen.findByRole("heading", { name: "Avril 2026" });

      await user.click(screen.getByRole("button", { name: "Aller à aujourd'hui" }));
      await screen.findByRole("heading", { name: "Mars 2026" });

      expect(screen.getByTestId("calendar-day-2026-03-15")).toHaveAttribute("aria-pressed", "true");
    });
  });

  // M10 Phase 1's per-screen backlog: a real 375px measurement (not just
  // the original source-read audit, which only flagged the day cell's own
  // width as "a real candidate") found the grid at gap-1 puts each day
  // cell at 36px wide — well under 44px — and the month-nav buttons at
  // 42px, 2px short. jsdom computes no real layout, so there is no
  // behaviour left to assert beyond "the classes that produce the fix are
  // actually on the rendered element" (docs/UI.md's own class-name-
  // assertion exception) — the actual resulting width (44.14px, no
  // horizontal overflow) is checked for real in
  // e2e/calendar-mobile.spec.ts against an actual browser layout.
  it("the calendar grid drops its own gap on mobile (reset from md up) — the gap alone was the difference between a 36px and a 44px-wide day cell, not a change to any cell's own size classes", async () => {
    stubFetch({});
    renderScreen();

    const grid = await screen.findByTestId("calendar-grid");
    expect(grid.className).toMatch(/gap-0/);
    expect(grid.className).toMatch(/md:gap-1/);
  });

  it("each month-nav button carries a 44px minimum width on mobile, reset back to its own natural width from md up", async () => {
    stubFetch({});
    renderScreen();
    await screen.findByTestId("calendar-grid");

    for (const name of [/mois précédent/i, /mois suivant/i]) {
      const button = screen.getByRole("button", { name });
      expect(button.className).toMatch(/min-w-11/);
      expect(button.className).toMatch(/md:min-w-0/);
    }
  });
});
