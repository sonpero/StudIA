const MS_PER_DAY = 24 * 60 * 60 * 1000;

// Overdue is a fact, not an alarm (docs/modules/review.md, docs/UI.md).
export function daysOverdue(due: string, now: Date): number {
  const elapsedMs = now.getTime() - new Date(due).getTime();
  return elapsedMs <= 0 ? 0 : Math.floor(elapsedMs / MS_PER_DAY);
}
