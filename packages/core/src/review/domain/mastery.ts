import type { CardSchedule } from "./types.js";

// A card is mastered when stability >= 21 days and reps >= 3
// (docs/modules/review.md). Defined once, exported, and read by planning
// (M5) and workspace (M6) through this module's index.ts — never duplicate
// this threshold elsewhere.
export const MASTERY_STABILITY_DAYS_THRESHOLD = 21;
export const MASTERY_REPS_THRESHOLD = 3;

export function isMastered(schedule: CardSchedule): boolean {
  return schedule.stability >= MASTERY_STABILITY_DAYS_THRESHOLD && schedule.reps >= MASTERY_REPS_THRESHOLD;
}
