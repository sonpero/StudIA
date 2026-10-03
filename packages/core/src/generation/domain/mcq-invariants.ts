// mcq invariants (docs/modules/generation.md): the answer is exactly one of
// the four options, all four are distinct, and distractors are plausible
// (comparable length to the correct answer). Trimmed and case-folded so a
// model's incidental whitespace/casing never trips these up.
function normalize(value: string): string {
  return value.trim().toLowerCase();
}

export function answerAmongOptions(answer: string, options: string[]): boolean {
  const normalizedAnswer = normalize(answer);
  return options.some((option) => normalize(option) === normalizedAnswer);
}

export function areOptionsDistinct(options: string[]): boolean {
  const normalized = options.map(normalize);
  return new Set(normalized).size === normalized.length;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

// Heuristic, not a proof of plausibility (docs/modules/generation.md): no
// option shorter than half or longer than twice the median length.
export function optionLengthsArePlausible(options: string[]): boolean {
  const lengths = options.map((option) => option.trim().length);
  const med = median(lengths);
  return lengths.every((len) => len >= med / 2 && len <= med * 2);
}

function fold(value: string): string {
  return normalize(value)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

// An option that only makes sense by where it sits ("A et B", "toutes les
// réponses ci-dessus") breaks once the options are shuffled, and gives the
// answer away when it is the odd one out (M11, decision D8).
const POSITION_DEPENDENT = [
  /\bci-?dessus\b/,
  /\bci-?dessous\b/,
  /\b(toutes|tous) les (reponses|propositions|options|choix)\b/,
  /\baucune (des|de ces) (reponses|propositions|options)\b/,
  /^(les )?(reponses? |options? |propositions? )?[a-d] et [a-d]\b/,
  /\bles deux (premieres|dernieres|precedentes|autres)\b/,
  /^(reponse|option|proposition) [a-d]$/,
];

export function optionsArePositionIndependent(options: string[]): boolean {
  return options.every((option) => !POSITION_DEPENDENT.some((pattern) => pattern.test(fold(option))));
}

// The first real eval (2026-10-03, decisions D17) found the correct answer
// was the longest option in 7 MCQs out of 9: longer and more precise than
// distractors written to be wrong, so a learner could pick it by length
// alone. Asking in the prompt did not change it; this rejects it. Up to
// 20 % longer than the longest distractor does not stand out.
const MAX_ANSWER_TO_LONGEST_DISTRACTOR = 1.2;

export function answerStandsOutByLength(answer: string, options: string[]): boolean {
  const normalizedAnswer = normalize(answer);
  const distractors = options.filter((option) => normalize(option) !== normalizedAnswer);
  const longestDistractor = Math.max(0, ...distractors.map((option) => option.trim().length));
  return answer.trim().length > longestDistractor * MAX_ANSWER_TO_LONGEST_DISTRACTOR;
}
