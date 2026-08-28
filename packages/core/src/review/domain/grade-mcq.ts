import type { Rating } from "./types.js";

// mcq is graded by exact option match, never by a model
// (docs/modules/review.md). Confirmed mapping (product decision): correct
// -> good(3), incorrect -> again(1).
export function gradeMcq(expected: string, given: string): { correct: boolean; suggestedRating: Rating } {
  const correct = normalize(expected) === normalize(given);
  return { correct, suggestedRating: correct ? 3 : 1 };
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}
