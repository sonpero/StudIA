import type { ProgressRepository } from "../domain/ports.js";

export interface DeleteDeadlineDeps {
  repo: ProgressRepository;
}

export function deleteDeadline(deps: DeleteDeadlineDeps, userId: string, documentId: string): Promise<void> {
  return deps.repo.deleteDeadline(userId, documentId);
}
