import type { NotionProgress, ReviewRepository } from "../domain/ports.js";

export interface GetNotionsProgressDeps {
  repo: ReviewRepository;
}

export function getNotionsProgress(deps: GetNotionsProgressDeps, userId: string, documentId: string): Promise<NotionProgress[]> {
  return deps.repo.getNotionsProgress(userId, documentId);
}
