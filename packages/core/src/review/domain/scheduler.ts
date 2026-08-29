// The only file in the project allowed to import ts-fsrs
// (dependency-cruiser's no-fsrs-outside-review rule, CLAUDE.md). Everything
// downstream of this module talks in CardSchedule, never in ts-fsrs's own
// Card type.
import { createEmptyCard, fsrs, generatorParameters, State, type Card as FsrsCard } from "ts-fsrs";
import type { CardSchedule, Rating } from "./types.js";

// enable_short_term: false — CardSchedule deliberately does not persist
// ts-fsrs's learning_steps/scheduled_days/elapsed_days or the
// Learning/Relearning states; with short-term steps disabled, every card is
// either New or Review, and reconstructing a full ts-fsrs Card from just
// {due, stability, difficulty, reps, lapses, lastReviewedAt} on each call
// (toFsrsCard below) reproduces exactly what continuously tracking the full
// object would have produced — verified empirically against ts-fsrs before
// writing this file. enable_fuzz: false — fuzz adds random jitter to the
// due date, which would break "same inputs always yield the same schedule"
// (docs/modules/review.md's key tests; docs/TESTING.md: no tolerance windows).
const engine = fsrs(generatorParameters({ enable_short_term: false, enable_fuzz: false }));

function toFsrsCard(current: CardSchedule): FsrsCard {
  return {
    due: new Date(current.due),
    stability: current.stability,
    difficulty: current.difficulty,
    elapsed_days: 0,
    scheduled_days: 0,
    learning_steps: 0,
    reps: current.reps,
    lapses: current.lapses,
    state: current.reps === 0 ? State.New : State.Review,
    last_review: current.lastReviewedAt ? new Date(current.lastReviewedAt) : undefined,
  };
}

// now is always injected, nothing here calls new Date() (docs/modules/review.md).
// current.cardId/userId are carried through unchanged; for a brand-new card
// (current === null) the caller (review/application) is the one that knows
// the real cardId/userId and sets them on the result — this function only
// computes the FSRS state transition.
// Added for `progress` (docs/modules/progress.md): the projection crosses
// the module boundary as a plain number, never as an ts-fsrs Card — this
// file stays the only one that imports ts-fsrs. `at` is the target date to
// project to (the deadline, or now+14d for a course with none), never
// computed here.
export function projectRetrievability(cardSchedule: CardSchedule, at: Date): number {
  return engine.get_retrievability(toFsrsCard(cardSchedule), at, false);
}

export function schedule(current: CardSchedule | null, rating: Rating, now: Date): CardSchedule {
  const fsrsCard = current ? toFsrsCard(current) : createEmptyCard(now);
  const { card } = engine.next(fsrsCard, now, rating);

  return {
    cardId: current?.cardId ?? "",
    userId: current?.userId ?? "",
    due: card.due.toISOString(),
    stability: card.stability,
    difficulty: card.difficulty,
    reps: card.reps,
    lapses: card.lapses,
    lastReviewedAt: now.toISOString(),
  };
}
