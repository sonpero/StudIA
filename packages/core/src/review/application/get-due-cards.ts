import { withMastery, type DueCardWithMastery } from "../domain/mastery.js";
import type { ReviewRepository } from "../domain/ports.js";

export interface GetDueCardsDeps {
  repo: ReviewRepository;
}

// Due first, then new, ordered by notion position (docs/modules/review.md).
// dayBoundary is the client's local "start of tomorrow": dueness is a
// calendar-day threshold, not an instant.
export async function getDueCards(
  deps: GetDueCardsDeps,
  userId: string,
  dayBoundary: Date,
  filter: { documentId?: string; notionId?: string; limit?: number },
): Promise<DueCardWithMastery[]> {
  const cards = await deps.repo.getDueCards(userId, dayBoundary, filter);
  return cards.map(withMastery);
}
