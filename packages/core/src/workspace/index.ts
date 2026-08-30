export type { Todo, TodayView, TodoProposal, CalendarEntry, CalendarDay, CalendarView } from "./domain/types.js";
export type { TodoRepository, TodoExtractor, ExtractedTodo, TodoExtractionOutput, TodoExtractionError } from "./domain/ports.js";
export { daysAway } from "./domain/days-away.js";

export { createTodo, type CreateTodoDeps, type CreateTodoInput } from "./application/create-todo.js";
export { updateTodo, type UpdateTodoDeps, type UpdateTodoPatch } from "./application/update-todo.js";
export { deleteTodo, type DeleteTodoDeps } from "./application/delete-todo.js";
export { getToday, type GetTodayDeps } from "./application/get-today.js";
export { getCalendar, type GetCalendarDeps } from "./application/get-calendar.js";
export { startTodoPhotoExtraction, type StartTodoPhotoExtractionDeps } from "./application/start-todo-photo-extraction.js";
export { handleTodoPhotoJob, type HandleTodoPhotoJobDeps, type ExtractTodoPhotoPayload } from "./application/handle-todo-photo-job.js";
export { getProposals, type GetProposalsDeps } from "./application/get-proposals.js";
export { confirmProposals, type ConfirmProposalsDeps } from "./application/confirm-proposals.js";
export { rejectProposals, type RejectProposalsDeps } from "./application/reject-proposals.js";

export { SqliteTodoRepository, type WorkspaceDb } from "./infra/sqlite-todo-repository.js";
export { FixtureTodoExtractor, type FixtureCase as TodoExtractorFixtureCase } from "./infra/fixture-todo-extractor.js";
export { ClaudeTodoExtractor } from "./infra/claude-todo-extractor.js";
// For apps/api/drizzle.config.ts's glob (same reason as every other module).
export { todosTable, todoProposalsTable } from "./infra/schema.js";
