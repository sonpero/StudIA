import type { IdGenerator } from "../../shared/index.js";
import { schedule } from "../domain/scheduler.js";
import type { ReviewRepository } from "../domain/ports.js";
import type { CardSchedule, Rating } from "../domain/types.js";

export interface SubmitReviewDeps {
  repo: ReviewRepository;
  idGenerator: IdGenerator;
}

// Writes the review, recomputes the schedule, both in one short transaction
// (docs/modules/review.md). No LLM call is involved in M3 (review has no
// LLM port), so there is nothing to keep outside the transaction here — the
// scheduler itself is pure arithmetic.
export async function submitReview(
  deps: SubmitReviewDeps,
  userId: string,
  cardId: string,
  rating: Rating,
  elapsedMs: number,
  now: Date,
): Promise<CardSchedule> {
  const current = await deps.repo.findSchedule(userId, cardId);
  const next = { ...schedule(current, rating, now), cardId, userId };

  await deps.repo.submitReview(
    userId,
    { id: deps.idGenerator.next(), cardId, userId, rating, reviewedAt: now.toISOString(), elapsedMs },
    next,
  );

  return next;
}
