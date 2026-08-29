import type { Deadline, ProgressRepository } from "../domain/ports.js";

export interface GetDeadlineDeps {
  repo: ProgressRepository;
}

// Fills the M5-as-shipped debt: the deadline form was write-only.
export function getDeadline(deps: GetDeadlineDeps, userId: string, documentId: string): Promise<Deadline | null> {
  return deps.repo.getDeadline(userId, documentId);
}
