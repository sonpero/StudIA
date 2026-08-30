import type { DocumentRepository } from "../../ingestion/index.js";
import type { ProgressRepository } from "../../progress/index.js";
import { buildCalendarView, filterDeadlinesInRange } from "../domain/calendar.js";
import type { TodoRepository } from "../domain/ports.js";
import type { CalendarView } from "../domain/types.js";

export interface GetCalendarDeps {
  todoRepo: TodoRepository;
  documentRepo: DocumentRepository;
  progressRepo: ProgressRepository;
}

// Composes docs/modules/workspace.md's Calendar section from three
// reads: todos are already range-scoped in SQL
// (todoRepo.getTodosForUserInRange); deadlines are not — getDeadlinesForUser
// is the same unscoped, whole-table-for-the-user read getToday already
// uses, deliberately not widened with a second SQL shape for a table this
// small (see that section) — so filterDeadlinesInRange (pure, no I/O) does
// the scoping here instead. documentRepo.listDocuments supplies course
// titles and colours, same read getToday makes for the same reason.
export async function getCalendar(deps: GetCalendarDeps, userId: string, start: string, end: string): Promise<CalendarView> {
  const [documents, deadlines, todos] = await Promise.all([
    deps.documentRepo.listDocuments(userId),
    deps.progressRepo.getDeadlinesForUser(userId),
    deps.todoRepo.getTodosForUserInRange(userId, start, end),
  ]);

  const deadlinesInRange = filterDeadlinesInRange(deadlines, start, end);
  const courses = documents.map((d) => ({ id: d.id, title: d.title, colour: d.colour }));

  return buildCalendarView(deadlinesInRange, todos, courses, start, end);
}
