export type { Deadline, ProgressRepository } from "./domain/ports.js";
export type { CourseProgress, ProgressInputError } from "./domain/types.js";
export { PROGRESS_STATUS_MARGIN, PROGRESS_RECENTLY_ADDED_DAYS, PROGRESS_TARGET_READINESS, PROGRESS_NO_DEADLINE_HORIZON_DAYS } from "./domain/types.js";
export { computeProgress, notionsBelowTarget, readinessProjectionDate } from "./domain/compute-progress.js";

export { setDeadline, type SetDeadlineDeps } from "./application/set-deadline.js";
export { deleteDeadline, type DeleteDeadlineDeps } from "./application/delete-deadline.js";
export { getDeadline, type GetDeadlineDeps } from "./application/get-deadline.js";
export { getCourseProgress, type GetCourseProgressDeps, type GetCourseProgressOk, type GetCourseProgressErr } from "./application/get-course-progress.js";
export { listProgress, type ListProgressDeps, type ProgressListItem } from "./application/list-progress.js";
// New for workspace's TodayView (M6, docs/modules/workspace.md): does no
// I/O of its own, see its own file comment. NotionCardRow is the shape
// workspace must group review.getCardSchedulesForUser's rows into before
// calling it, one document at a time.
export { notionsBelowTargetForDocument } from "./application/notions-below-target-for-document.js";
export type { NotionCardRow } from "./application/assemble-progress-notions.js";

export { SqliteProgressRepository, type ProgressDb } from "./infra/sqlite-progress-repository.js";
// For apps/api/drizzle.config.ts's glob (same reason as every other module).
export { deadlinesTable } from "./infra/schema.js";
