import type { IdGenerator } from "../../shared/index.js";
import type { DueCard } from "../domain/due-card.js";
import type { ReviewRepository } from "../domain/ports.js";

export interface StartSessionDeps {
  repo: ReviewRepository;
  idGenerator: IdGenerator;
}

// Creates a session, draws its cards (docs/modules/review.md). Sessions are
// not fixed-length: no target count, no timer — this just records when it
// started and hands back whatever is due right now.
export async function startSession(
  deps: StartSessionDeps,
  userId: string,
  now: Date,
  filter: { documentId?: string; limit?: number },
): Promise<{ sessionId: string; cards: DueCard[] }> {
  const sessionId = deps.idGenerator.next();
  const [cards] = await Promise.all([
    deps.repo.getDueCards(userId, now, filter),
    deps.repo.createSession(userId, { id: sessionId, documentId: filter.documentId ?? null, startedAt: now.toISOString() }),
  ]);
  return { sessionId, cards };
}
