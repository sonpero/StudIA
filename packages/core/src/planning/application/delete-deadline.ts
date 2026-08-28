import type { PlanningRepository } from "../domain/ports.js";

export interface DeleteDeadlineDeps {
  repo: PlanningRepository;
}

export function deleteDeadline(deps: DeleteDeadlineDeps, userId: string, documentId: string): Promise<void> {
  return deps.repo.deleteDeadline(userId, documentId);
}
