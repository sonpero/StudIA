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
