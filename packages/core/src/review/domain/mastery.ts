import type { DueCard } from "./due-card.js";
import type { CardSchedule } from "./types.js";

// A card is mastered when stability >= 21 days and reps >= 3
// (docs/modules/review.md). `progress` (M5) does not use this threshold —
// its readiness computation reads raw retrievability, not `mastered` — the
// only current caller outside this module is the front end, and only
// indirectly, via the `mastered` boolean withMastery already attaches
// below. Kept exported in case workspace's M6 TodayView needs the raw
// threshold rather than just that boolean; never duplicate it elsewhere if
// so.
export const MASTERY_STABILITY_DAYS_THRESHOLD = 21;
export const MASTERY_REPS_THRESHOLD = 3;

export function isMastered(schedule: CardSchedule): boolean {
  return schedule.stability >= MASTERY_STABILITY_DAYS_THRESHOLD && schedule.reps >= MASTERY_REPS_THRESHOLD;
}

export type DueCardWithMastery = DueCard & { mastered: boolean };

// getDueCards and startSession pass every card through this so the front
// receives `mastered` without recomputing the threshold itself.
export function withMastery(card: DueCard): DueCardWithMastery {
  return { ...card, mastered: card.schedule !== null && isMastered(card.schedule) };
}
