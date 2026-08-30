import { describe, expect, it } from "vitest";
import type { Deadline } from "../../progress/index.js";
import { buildCalendarView, filterDeadlinesInRange } from "./calendar.js";
import type { Todo } from "./types.js";

function aDeadline(overrides: Partial<Deadline> = {}): Deadline {
  return { id: "d1", documentId: "doc-1", userId: "u1", date: "2026-03-10", label: null, createdAt: "2026-01-01T00:00:00.000Z", ...overrides };
}

function aTodo(overrides: Partial<Todo> = {}): Todo {
  return { id: "t1", userId: "u1", label: "Réviser", dueDate: "2026-03-10", documentId: null, done: false, source: "manual", createdAt: "2026-01-01T00:00:00.000Z", ...overrides };
}

describe("filterDeadlinesInRange", () => {
  // Same inclusive bounds, same test dates as SqliteTodoRepository's own
  // getTodosForUserInRange (docs/modules/workspace.md's Calendar section):
  // two different boundary conventions on the same view would shift a
  // deadline by a day relative to a todo, invisible except exactly on a
  // boundary. Deadlines have no null-date analogue to the todos query's
  // fifth case (`deadlines.date` is NOT NULL) — the fifth case here is
  // selective filtering across more than one deadline instead, since
  // that is not exercised by any of the four boundary cases alone.
  it("includes a deadline dated exactly the range's start", () => {
    expect(filterDeadlinesInRange([aDeadline({ date: "2026-03-01" })], "2026-03-01", "2026-03-31")).toEqual([aDeadline({ date: "2026-03-01" })]);
  });

  it("includes a deadline dated exactly the range's end", () => {
    expect(filterDeadlinesInRange([aDeadline({ date: "2026-03-31" })], "2026-03-01", "2026-03-31")).toEqual([aDeadline({ date: "2026-03-31" })]);
  });

  it("excludes a deadline dated the day before the range's start", () => {
    expect(filterDeadlinesInRange([aDeadline({ date: "2026-02-28" })], "2026-03-01", "2026-03-31")).toEqual([]);
  });

  it("excludes a deadline dated the day after the range's end", () => {
    expect(filterDeadlinesInRange([aDeadline({ date: "2026-04-01" })], "2026-03-01", "2026-03-31")).toEqual([]);
  });

  it("of several deadlines, keeps only the ones inside the range", () => {
    const inRange = aDeadline({ id: "in", documentId: "doc-1", date: "2026-03-15" });
    const before = aDeadline({ id: "before", documentId: "doc-2", date: "2026-02-15" });
    const after = aDeadline({ id: "after", documentId: "doc-3", date: "2026-04-15" });

    expect(filterDeadlinesInRange([before, inRange, after], "2026-03-01", "2026-03-31")).toEqual([inRange]);
  });
});

describe("buildCalendarView", () => {
  it("groups a deadline and a todo on the same day into one CalendarDay", () => {
    const view = buildCalendarView([aDeadline({ date: "2026-03-10" })], [aTodo({ id: "t1", dueDate: "2026-03-10" })], [{ id: "doc-1", title: "Maths", colour: "#F87171" }], "2026-03-01", "2026-03-31");

    expect(view.days).toEqual([
      {
        date: "2026-03-10",
        entries: [
          { kind: "deadline", id: "d1", title: "Maths", documentId: "doc-1", colour: "#F87171", done: null },
          { kind: "todo", id: "t1", title: "Réviser", documentId: null, colour: null, done: false },
        ],
      },
    ]);
  });

  it("a day with only a deadline and a day with only a todo are two separate CalendarDays", () => {
    const view = buildCalendarView(
      [aDeadline({ date: "2026-03-05" })],
      [aTodo({ dueDate: "2026-03-20" })],
      [{ id: "doc-1", title: "Maths", colour: "#F87171" }],
      "2026-03-01",
      "2026-03-31",
    );

    expect(view.days.map((d) => d.date)).toEqual(["2026-03-05", "2026-03-20"]);
  });

  it("a date with nothing is absent from days entirely, never present with an empty entries array", () => {
    const view = buildCalendarView([], [], [], "2026-03-01", "2026-03-31");
    expect(view.days).toEqual([]);
  });

  // The property the whole "several elements the same day" question turns
  // on (docs/UI.md's Calendrier note, docs/modules/workspace.md's Calendar
  // section "Order is a contract"): deadlines first, always, regardless of
  // which array a given day's entries happen to come from or in what order
  // this function receives them.
  it("orders a day's entries with every deadline before every todo, deadlines passed after todos", () => {
    const view = buildCalendarView(
      [aDeadline({ id: "d1", documentId: "doc-1", date: "2026-03-10" })],
      [aTodo({ id: "t1", dueDate: "2026-03-10" }), aTodo({ id: "t2", dueDate: "2026-03-10" })],
      [{ id: "doc-1", title: "Maths", colour: "#F87171" }],
      "2026-03-01",
      "2026-03-31",
    );

    expect(view.days[0]!.entries.map((e) => e.kind)).toEqual(["deadline", "todo", "todo"]);
  });

  it("a course-less todo gets colour: null, never a guessed or default colour", () => {
    const view = buildCalendarView([], [aTodo({ documentId: null, dueDate: "2026-03-10" })], [{ id: "doc-1", title: "Maths", colour: "#F87171" }], "2026-03-01", "2026-03-31");

    expect(view.days[0]!.entries[0]!.colour).toBeNull();
  });

  it("a course-linked todo takes that course's colour and title-independent identity (its own label, not the course's title)", () => {
    const view = buildCalendarView(
      [],
      [aTodo({ documentId: "doc-1", label: "Rendre le devoir", dueDate: "2026-03-10" })],
      [{ id: "doc-1", title: "Maths", colour: "#F87171" }],
      "2026-03-01",
      "2026-03-31",
    );

    expect(view.days[0]!.entries[0]!).toEqual({ kind: "todo", id: "t1", title: "Rendre le devoir", documentId: "doc-1", colour: "#F87171", done: false });
  });

  it("echoes start and end back on the view unchanged", () => {
    const view = buildCalendarView([], [], [], "2026-03-01", "2026-03-31");
    expect(view.start).toBe("2026-03-01");
    expect(view.end).toBe("2026-03-31");
  });
});
