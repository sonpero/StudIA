export { WEEKDAYS, ZERO_AVAILABILITY } from "./domain/types.js";
export type { Availability, BuildPlanInput, Plan, PlanDay, PlanEntry, PlanNotion, PlanningInputError, Weekday } from "./domain/types.js";
export { LEARN_MINUTES, REVIEW_MINUTES } from "./domain/estimation.js";
export { buildPlan } from "./domain/build-plan.js";
export type { Deadline, PlanningRepository } from "./domain/ports.js";

export { setDeadline, type SetDeadlineDeps } from "./application/set-deadline.js";
export { deleteDeadline, type DeleteDeadlineDeps } from "./application/delete-deadline.js";
export { setAvailability, type SetAvailabilityDeps } from "./application/set-availability.js";
export { getPlan, type GetPlanDeps } from "./application/get-plan.js";
export { getToday, type GetTodayDeps, type TodayEntry } from "./application/get-today.js";
export { markDayCompleted, type MarkDayCompletedDeps } from "./application/mark-day-completed.js";

export { SqlitePlanningRepository, type PlanningDb } from "./infra/sqlite-planning-repository.js";
// For apps/api/drizzle.config.ts's glob (same reason as every other module).
export { availabilityTable, deadlinesTable, planHistoryTable } from "./infra/schema.js";
