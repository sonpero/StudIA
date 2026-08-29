function toDateKey(iso: string): string {
  return iso.slice(0, 10);
}

// A fact, not a warning (docs/modules/workspace.md): no clamping to 0, no
// countdown framing. Whole-day granularity against the UTC date key, same
// convention as progress's own daysBetween (docs/modules/progress.md) —
// dateKey and now are both truncated to a calendar day before comparing.
export function daysAway(dateKey: string, now: Date): number {
  const from = Date.parse(`${toDateKey(now.toISOString())}T00:00:00.000Z`);
  const to = Date.parse(`${dateKey}T00:00:00.000Z`);
  return Math.round((to - from) / 86_400_000);
}
