import type { CardRepository } from "../domain/ports.js";
import type { Card } from "../domain/types.js";

export interface ListCardsDeps {
  repo: CardRepository;
}

export function listCards(deps: ListCardsDeps, userId: string, notionId: string): Promise<Card[]> {
  return deps.repo.listCards(userId, notionId);
}
