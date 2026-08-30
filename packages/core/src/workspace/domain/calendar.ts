import type { Deadline } from "../../progress/index.js";
import type { CalendarDay, CalendarEntry, CalendarView, Todo } from "./types.js";

// Both bounds inclusive — must match SqliteTodoRepository's own
// getTodosForUserInRange exactly (docs/modules/workspace.md's Calendar
// section): two different boundary conventions in the same view would
// shift a deadline by a day relative to a todo, invisible except exactly
// on a boundary. No I/O of its own — takes rows the caller already
// fetched, same discipline notionsBelowTargetForDocument established.
export function filterDeadlinesInRange(deadlines: Deadline[], start: string, end: string): Deadline[] {
  return deadlines.filter((deadline) => deadline.date >= start && deadline.date <= end);
}

export type CourseInfo = { id: string; title: string; colour: string };

// Groups already-range-filtered deadlines and todos into one CalendarDay
// per date that has something, deadlines always ordered before todos on
// the same date — a contract, not an accident (docs/modules/workspace.md):
// deadlines are folded in fully before any todo is, so the order within a
// day's `entries` follows from iteration order alone, needing no sort
// step the density rule (docs/UI.md's Calendrier note) could then get
// wrong by sorting on the wrong key. Trusts both inputs are already
// scoped to [start, end] — filterDeadlinesInRange and
// TodoRepository.getTodosForUserInRange are what enforce that, not this
// function, which would otherwise duplicate the same boundary logic in a
// third place.
export function buildCalendarView(deadlines: Deadline[], todos: Todo[], documents: CourseInfo[], start: string, end: string): CalendarView {
  const documentById = new Map(documents.map((d) => [d.id, d]));
  const entriesByDate = new Map<string, CalendarEntry[]>();

  function push(date: string, entry: CalendarEntry): void {
    const list = entriesByDate.get(date);
    if (list) list.push(entry);
    else entriesByDate.set(date, [entry]);
  }

  for (const deadline of deadlines) {
    const course = documentById.get(deadline.documentId);
    push(deadline.date, { kind: "deadline", id: deadline.id, title: course?.title ?? "", documentId: deadline.documentId, colour: course?.colour ?? null, done: null });
  }

  for (const todo of todos) {
    if (todo.dueDate === null) continue; // already excluded upstream; narrows the type here
    const course = todo.documentId ? documentById.get(todo.documentId) : undefined;
    push(todo.dueDate, { kind: "todo", id: todo.id, title: todo.label, documentId: todo.documentId, colour: course?.colour ?? null, done: todo.done });
  }

  const days: CalendarDay[] = [...entriesByDate.entries()].map(([date, entries]) => ({ date, entries })).sort((a, b) => a.date.localeCompare(b.date));

  return { start, end, days };
}
