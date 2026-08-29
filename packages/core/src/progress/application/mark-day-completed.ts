import type { ProgressRepository } from "../domain/ports.js";

export interface MarkDayCompletedDeps {
  repo: ProgressRepository;
}

// History only, never a schedule change and never a streak (docs/modules/progress.md).
export function markDayCompleted(deps: MarkDayCompletedDeps, userId: string, date: string): Promise<void> {
  return deps.repo.markDayCompleted(userId, date);
}
