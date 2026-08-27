import type { CardRepository } from "../domain/ports.js";

export interface MarkStaleDeps {
  repo: CardRepository;
}

// Called when a notion's body changes (docs/modules/generation.md).
export function markStale(deps: MarkStaleDeps, userId: string, notionId: string): Promise<void> {
  return deps.repo.markStale(userId, notionId);
}
