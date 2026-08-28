import type { PlanningRepository } from "../domain/ports.js";

export interface MarkDayCompletedDeps {
  repo: PlanningRepository;
}

// History only, never a schedule change and never a streak (docs/modules/planning.md).
export function markDayCompleted(deps: MarkDayCompletedDeps, userId: string, date: string): Promise<void> {
  return deps.repo.markDayCompleted(userId, date);
}
