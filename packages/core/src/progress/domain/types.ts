export const PROGRESS_STATUS_MARGIN = 0.1; // see compute-progress.ts's status logic
export const PROGRESS_RECENTLY_ADDED_DAYS = 7; // see compute-progress.ts's recentlyAddedUnreviewed
export const PROGRESS_TARGET_READINESS = 0.9; // matches review's own FSRS request_retention default
export const PROGRESS_NO_DEADLINE_HORIZON_DAYS = 14; // rolling projection window without a deadline

export type ProgressCardState = { retrievability: number; reviewed: boolean };

export type ProgressNotion = { id: string; createdAt: string; cards: ProgressCardState[] };

// date/setAt are both plain ISO dates (YYYY-MM-DD); the application layer
// truncates deadlines.createdAt's timestamp down to a date before calling in.
export type ProgressDeadlineInput = { date: string; setAt: string };

export type CourseProgress = {
  coverage: number; // 0..1
  readiness: number; // 0..1
  status: "ahead" | "on-track" | "behind" | "no-deadline" | "deadline-in-past";
  behindByNotions: number; // 0 outside 'behind'
  recentlyAddedUnreviewed: number;
};

export type ProgressInputError = { kind: "deadline-in-past" };
