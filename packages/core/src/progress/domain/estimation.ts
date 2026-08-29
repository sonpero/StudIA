import type { Difficulty } from "../../content/index.js";

// docs/modules/progress.md's estimation table: a lookup, never a model
// output. One exported constant so it can be tuned in one place once real
// review durations exist (reviews.elapsed_ms). Do not do this before M7.
export const LEARN_MINUTES: Record<Difficulty, number> = { easy: 8, medium: 12, hard: 18 };

// "a third of that for review" (docs/modules/progress.md), rounded to the
// nearest minute: 8/3 -> 3, 12/3 -> 4, 18/3 -> 6.
export const REVIEW_MINUTES: Record<Difficulty, number> = { easy: 3, medium: 4, hard: 6 };
