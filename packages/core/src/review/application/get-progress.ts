import type { ReviewRepository } from "../domain/ports.js";

export interface GetProgressDeps {
  repo: ReviewRepository;
}

export function getProgress(deps: GetProgressDeps, userId: string, documentId: string): Promise<{ mastered: number; total: number }> {
  return deps.repo.getProgress(userId, documentId);
}
