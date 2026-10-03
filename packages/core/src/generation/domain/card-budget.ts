// M11's single volume setting (docs/reports/notions-cles-conception.md): the
// key-notion count, derived from the course's length, grows slowly then
// plateaus. Every card count follows from it: one flashcard per key notion,
// one MCQ per essential key notion, one open question per synthesis key
// notion. So the MCQ and open ranges are also the ranges of essential and
// synthesis key notions the extraction is asked for.
//
// The reference points are the 2026-10-03 targets, in pages of the A2A
// course's density (~1 500 characters of extracted text per page). The
// one-page point is ours (decision D4): below it, the range stays put.
export type Range = { min: number; max: number };
export type CardBudget = { keyNotions: Range; mcq: Range; open: Range };

type Anchor = { pages: number; keyNotions: [number, number]; mcq: [number, number]; open: [number, number] };

export const CARD_BUDGET = {
  charsPerPage: 1_500,
  anchors: [
    { pages: 1, keyNotions: [5, 10], mcq: [2, 4], open: [1, 2] },
    { pages: 5, keyNotions: [15, 25], mcq: [6, 10], open: [2, 4] },
    { pages: 25, keyNotions: [40, 60], mcq: [20, 30], open: [8, 12] },
    { pages: 60, keyNotions: [70, 90], mcq: [35, 45], open: [12, 15] },
  ] satisfies Anchor[],
  // 90 + 45 + 15 at the plateau; also enforced on the generated cards.
  totalCardCap: 150,
  // Key notions per generation call, per card type: small enough that a
  // call's output stays far under the per-call token limit (an MCQ is the
  // largest card, ~150 output tokens), large enough to keep calls few.
  batchSize: { flashcard: 15, mcq: 10, open: 8 },
  // The extraction sends the whole course in one call (decision D5).
  maxCourseChars: 400_000,
} as const;

function interpolate(lower: number, upper: number, share: number): number {
  return Math.round(lower + (upper - lower) * share);
}

export function cardBudget(courseChars: number): CardBudget {
  const { anchors } = CARD_BUDGET;
  const pages = courseChars / CARD_BUDGET.charsPerPage;
  const upperIndex = anchors.findIndex((anchor) => anchor.pages >= pages);
  const upper = anchors[upperIndex === -1 ? anchors.length - 1 : upperIndex]!;
  const lower = upperIndex > 0 ? anchors[upperIndex - 1]! : upper;
  const share = upper === lower ? 0 : (pages - lower.pages) / (upper.pages - lower.pages);

  const range = (kind: "keyNotions" | "mcq" | "open"): Range => ({
    min: interpolate(lower[kind][0], upper[kind][0], share),
    max: interpolate(lower[kind][1], upper[kind][1], share),
  });
  return { keyNotions: range("keyNotions"), mcq: range("mcq"), open: range("open") };
}
