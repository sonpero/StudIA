function toDateKey(iso: string): string {
  return iso.slice(0, 10);
}

function dayBefore(dateKey: string): string {
  return toDateKey(new Date(Date.parse(`${dateKey}T00:00:00.000Z`) - 86_400_000).toISOString());
}

// docs/UI.md's streak card, docs/MILESTONES.md's M9 acceptance: the count of
// consecutive calendar days, ending today or yesterday, with at least one
// FSRS review. activeDayKeys are UTC date keys (YYYY-MM-DD), the same
// convention as daysAway's own dateKey — the caller (getToday) derives them
// from reviews.reviewed_at via ReviewRepository.getReviewDayKeysForUser.
//
// Anchoring on "today or yesterday" (never further back) is what makes
// "activity today is not required to keep yesterday's count" true without
// a special case: yesterday still counts as the anchor when today is
// silent, but the day before yesterday does not when both today and
// yesterday are silent — that run is over, not merely paused.
//
// Walking backward one day at a time from the anchor, stopping at the
// first missing day, is what makes a gap anywhere further back
// irrelevant: an older unbroken run never gets added to the current one
// just because both appear in the input.
export function computeStreak(activeDayKeys: readonly string[], now: Date): number {
  const activeDays = new Set(activeDayKeys);
  const today = toDateKey(now.toISOString());
  const yesterday = dayBefore(today);

  let cursor: string;
  if (activeDays.has(today)) cursor = today;
  else if (activeDays.has(yesterday)) cursor = yesterday;
  else return 0;

  let streak = 0;
  while (activeDays.has(cursor)) {
    streak += 1;
    cursor = dayBefore(cursor);
  }
  return streak;
}
