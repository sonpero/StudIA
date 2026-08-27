import { err, ok, type Result } from "../../shared/index.js";
import type { ReviewRepository } from "../domain/ports.js";

export interface AbandonSessionDeps {
  repo: ReviewRepository;
}

// Answered cards keep their reviews (docs/modules/review.md): reviews are
// not linked to a session in persistence, so ending one never touches them.
export async function abandonSession(
  deps: AbandonSessionDeps,
  userId: string,
  sessionId: string,
  now: Date,
): Promise<Result<void, "not-found">> {
  const ended = await deps.repo.endSession(userId, sessionId, now.toISOString());
  return ended ? ok(undefined) : err("not-found");
}
