export type { Rating, CardSchedule, Review } from "./domain/types.js";
export type { DueCard } from "./domain/due-card.js";
export type { ReviewRepository, Session, NotionProgress, AnswerGrader, GradeError } from "./domain/ports.js";
export { MASTERY_STABILITY_DAYS_THRESHOLD, MASTERY_REPS_THRESHOLD, isMastered, withMastery, type DueCardWithMastery } from "./domain/mastery.js";
export { daysOverdue } from "./domain/days-overdue.js";
export { gradeMcq } from "./domain/grade-mcq.js";

export { getDueCards, type GetDueCardsDeps } from "./application/get-due-cards.js";
export { startSession, type StartSessionDeps } from "./application/start-session.js";
export { submitReview, type SubmitReviewDeps } from "./application/submit-review.js";
export { getProgress, type GetProgressDeps } from "./application/get-progress.js";
export { getNotionsProgress, type GetNotionsProgressDeps } from "./application/get-notions-progress.js";
export { abandonSession, type AbandonSessionDeps } from "./application/abandon-session.js";
export { gradeAnswer, type GradeAnswerDeps, type GradeResult } from "./application/grade-answer.js";

export { SqliteReviewRepository, type ReviewDb } from "./infra/sqlite-review-repository.js";
export { FixtureAnswerGrader, type FixtureCase as AnswerGraderFixtureCase } from "./infra/fixture-answer-grader.js";
export { ClaudeAnswerGrader } from "./infra/claude-answer-grader.js";
// For apps/api/drizzle.config.ts's glob (same reason as every other module).
export { cardSchedulesTable, reviewsTable, sessionsTable } from "./infra/schema.js";
