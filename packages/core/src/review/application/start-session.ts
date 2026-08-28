import type { IdGenerator } from "../../shared/index.js";
import { withMastery, type DueCardWithMastery } from "../domain/mastery.js";
import type { ReviewRepository } from "../domain/ports.js";

export interface StartSessionDeps {
  repo: ReviewRepository;
  idGenerator: IdGenerator;
}

// Creates a session, draws its cards (docs/modules/review.md). Sessions are
// not fixed-length: no target count, no timer — this just records when it
// started and hands back whatever is due right now.
//
// Two distinct clocks, don't conflate them: `now` is the real clock, used
// only for the session's own startedAt timestamp; `dayBoundary` is the
// client's local "start of tomorrow", used only for the due-cards
// threshold (a calendar-day rule, not an instant).
export async function startSession(
  deps: StartSessionDeps,
  userId: string,
  now: Date,
  dayBoundary: Date,
  filter: { documentId?: string; notionId?: string; limit?: number },
): Promise<{ sessionId: string; cards: DueCardWithMastery[] }> {
  const sessionId = deps.idGenerator.next();
  const [rawCards] = await Promise.all([
    deps.repo.getDueCards(userId, dayBoundary, filter),
    deps.repo.createSession(userId, { id: sessionId, documentId: filter.documentId ?? null, startedAt: now.toISOString() }),
  ]);
  return { sessionId, cards: rawCards.map(withMastery) };
}
