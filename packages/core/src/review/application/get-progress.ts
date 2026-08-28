import type { ReviewRepository } from "../domain/ports.js";

export interface GetProgressDeps {
  repo: ReviewRepository;
}

export function getProgress(
  deps: GetProgressDeps,
  userId: string,
  documentId: string,
  now: Date,
): Promise<{ mastered: number; total: number; nextDueDate: string | null }> {
  return deps.repo.getProgress(userId, documentId, now);
}
