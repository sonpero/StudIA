import { withMastery, type DueCardWithMastery } from "../domain/mastery.js";
import type { ReviewRepository } from "../domain/ports.js";

export interface GetDueCardsDeps {
  repo: ReviewRepository;
}

// Due first, then new, ordered by notion position (docs/modules/review.md).
export async function getDueCards(
  deps: GetDueCardsDeps,
  userId: string,
  now: Date,
  filter: { documentId?: string; notionId?: string; limit?: number },
): Promise<DueCardWithMastery[]> {
  const cards = await deps.repo.getDueCards(userId, now, filter);
  return cards.map(withMastery);
}
