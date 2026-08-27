import { err, ok, type Result } from "../../shared/index.js";
import type { CardRepository } from "../domain/ports.js";

export interface DeleteCardDeps {
  repo: CardRepository;
}

export async function deleteCard(deps: DeleteCardDeps, userId: string, cardId: string): Promise<Result<void, "not-found">> {
  const deleted = await deps.repo.deleteCard(userId, cardId);
  return deleted ? ok(undefined) : err("not-found");
}
