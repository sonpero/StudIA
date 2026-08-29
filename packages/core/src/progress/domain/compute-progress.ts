import { err, ok, type Result } from "../../shared/index.js";
import { PROGRESS_NO_DEADLINE_HORIZON_DAYS, PROGRESS_RECENTLY_ADDED_DAYS, PROGRESS_STATUS_MARGIN, PROGRESS_TARGET_READINESS } from "./types.js";
import type { CourseProgress, ProgressDeadlineInput, ProgressInputError, ProgressNotion } from "./types.js";

// The date review.projectRetrievability should project each card's
// retrievability to, before computeProgress ever sees it (computeProgress
// itself never knows FSRS exists — see "Why ProgressCardState" in
// docs/modules/progress.md). With a deadline: the deadline's own date, not
// today. Without: a rolling now + PROGRESS_NO_DEADLINE_HORIZON_DAYS window.
export function readinessProjectionDate(deadline: ProgressDeadlineInput | null, now: Date): Date {
  if (deadline !== null) return new Date(`${deadline.date}T00:00:00.000Z`);
  const d = new Date(now);
  d.setUTCDate(d.getUTCDate() + PROGRESS_NO_DEADLINE_HORIZON_DAYS);
  return d;
}

function toDateKey(iso: string): string {
  return iso.slice(0, 10);
}

function daysBetween(fromIso: string, toIso: string): number {
  const from = Date.parse(`${toDateKey(fromIso)}T00:00:00.000Z`);
  const to = Date.parse(`${toDateKey(toIso)}T00:00:00.000Z`);
  return Math.round((to - from) / 86_400_000);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function average(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((sum, v) => sum + v, 0) / values.length;
}

// A notion counts as covered the moment any one of its cards has been
// reviewed, regardless of how well it went (docs/modules/progress.md's
// Coverage section).
function isNotionCovered(notion: ProgressNotion): boolean {
  return notion.cards.some((c) => c.reviewed);
}

// retrievability is already projected to the right target date by the
// caller (review.projectRetrievability) — this function never recomputes
// it, and never knows FSRS exists. 0 for a notion with no cards at all,
// by construction of average([]).
function notionReadiness(notion: ProgressNotion): number {
  return average(notion.cards.map((c) => c.retrievability));
}

export function computeProgress(input: { notions: ProgressNotion[]; deadline: ProgressDeadlineInput | null; now: Date }): Result<CourseProgress, ProgressInputError> {
  const { notions, deadline, now } = input;
  const todayKey = toDateKey(now.toISOString());

  if (deadline !== null && deadline.date < todayKey) {
    return err({ kind: "deadline-in-past" });
  }

  if (notions.length === 0) {
    return ok({ coverage: 0, readiness: 0, status: deadline === null ? "no-deadline" : "on-track", behindByNotions: 0, recentlyAddedUnreviewed: 0 });
  }

  const perNotionReadiness = notions.map(notionReadiness);
  const coverage = notions.filter(isNotionCovered).length / notions.length;
  const readiness = average(perNotionReadiness);
  const recentlyAddedUnreviewed = notions.filter((n) => !isNotionCovered(n) && daysBetween(n.createdAt, now.toISOString()) <= PROGRESS_RECENTLY_ADDED_DAYS).length;

  if (deadline === null) {
    return ok({ coverage, readiness, status: "no-deadline", behindByNotions: 0, recentlyAddedUnreviewed });
  }

  // Only meaningful with a deadline. target is evaluated at `now`, not at
  // the deadline (unlike readiness, always evaluated at the deadline by
  // the caller) — this is what lets status react to time passing even
  // though readiness itself does not (docs/modules/progress.md).
  const spanDays = daysBetween(deadline.setAt, deadline.date);
  const elapsedDays = daysBetween(deadline.setAt, todayKey);
  const fraction = spanDays <= 0 ? 1 : clamp(elapsedDays / spanDays, 0, 1);
  const target = PROGRESS_TARGET_READINESS * fraction;

  const gap = readiness - target;
  const status: CourseProgress["status"] = readiness < target ? "behind" : gap > PROGRESS_STATUS_MARGIN ? "ahead" : "on-track";
  const behindByNotions = status === "behind" ? perNotionReadiness.filter((r) => r < target).length : 0;

  return ok({ coverage, readiness, status, behindByNotions, recentlyAddedUnreviewed });
}
