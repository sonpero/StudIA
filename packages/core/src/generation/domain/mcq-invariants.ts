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

// FNV-1a, then mulberry32: a few lines of deterministic randomness, so the
// same question always gets the same order (a regenerated or re-read card
// does not reshuffle) while the correct answer's position varies across
// questions.
function seededRandom(seed: string): () => number {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  let state = hash >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Models tend to put the correct answer first; nothing reorders the options
// later (neither the review route nor ReviewScreen).
export function shuffleOptions(options: string[], seed: string): string[] {
  const random = seededRandom(seed);
  const shuffled = [...options];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!];
  }
  return shuffled;
}
