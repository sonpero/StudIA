import type { DueCard } from "../domain/due-card.js";
import type { ReviewRepository } from "../domain/ports.js";

export interface GetDueCardsDeps {
  repo: ReviewRepository;
}

// Due first, then new, ordered by notion position (docs/modules/review.md).
export function getDueCards(
  deps: GetDueCardsDeps,
  userId: string,
  now: Date,
  filter: { documentId?: string; limit?: number },
): Promise<DueCard[]> {
  return deps.repo.getDueCards(userId, now, filter);
}
