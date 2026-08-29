export type { Deadline, ProgressRepository } from "./domain/ports.js";

export { setDeadline, type SetDeadlineDeps } from "./application/set-deadline.js";
export { deleteDeadline, type DeleteDeadlineDeps } from "./application/delete-deadline.js";

export { SqliteProgressRepository, type ProgressDb } from "./infra/sqlite-progress-repository.js";
// For apps/api/drizzle.config.ts's glob (same reason as every other module).
export { deadlinesTable } from "./infra/schema.js";
