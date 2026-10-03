import { CARD_BUDGET, type CardBudget } from "./card-budget.js";
import type { CardType, GeneratedCard, KeyNotionImportance } from "./types.js";

// What the extraction returns for one key notion, once its reading-notion
// references are resolved to ids (M11, docs/reports/notions-cles-conception.md).
export type KeyNotionCandidate = {
  title: string;
  summary: string;
  importance: KeyNotionImportance;
  isSynthesis: boolean;
  sectionIndex: number;
  readingNotionIds: string[];
};

// Indices into the key-notion list, per card type.
export type CardTargets = Record<CardType, number[]>;

export type PlannedCard = GeneratedCard & { keyNotionIndex: number };

const LEADING_ARTICLE = /^(le|la|les|l|un|une|des|du|de)\s+/;

export function normalizeKeyNotionTitle(title: string): string {
  return title
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(LEADING_ARTICLE, "");
}

// Two key notions with the same title are the same notion asked twice: the
// later one is folded into the first, which keeps its own title, summary
// and section, gains the other's reading notions, and keeps the stronger
// importance and synthesis flags.
export function dedupeKeyNotions(candidates: KeyNotionCandidate[]): KeyNotionCandidate[] {
  const kept: KeyNotionCandidate[] = [];
  const byTitle = new Map<string, KeyNotionCandidate>();
  for (const candidate of candidates) {
    const key = normalizeKeyNotionTitle(candidate.title);
    const first = byTitle.get(key);
    if (!first) {
      const copy = { ...candidate, readingNotionIds: [...candidate.readingNotionIds] };
      byTitle.set(key, copy);
      kept.push(copy);
      continue;
    }
    for (const id of candidate.readingNotionIds) if (!first.readingNotionIds.includes(id)) first.readingNotionIds.push(id);
    if (candidate.importance === "essential") first.importance = "essential";
    if (candidate.isSynthesis) first.isSynthesis = true;
  }
  return kept;
}

const rank = (candidate: KeyNotionCandidate) => (candidate.importance === "essential" ? 0 : 1);

// Above the budget's maximum: first the best key notion of every section
// (so no section loses its only one), then essentials before importants,
// earliest first. The result stays in course order.
export function capKeyNotions(candidates: KeyNotionCandidate[], max: number): KeyNotionCandidate[] {
  if (candidates.length <= max) return candidates;
  const byPriority = candidates.map((candidate, index) => ({ candidate, index })).sort((a, b) => rank(a.candidate) - rank(b.candidate) || a.index - b.index);

  const chosen = new Set<number>();
  const coveredSections = new Set<number>();
  for (const { candidate, index } of byPriority) {
    if (chosen.size >= max) break;
    if (coveredSections.has(candidate.sectionIndex)) continue;
    coveredSections.add(candidate.sectionIndex);
    chosen.add(index);
  }
  for (const { index } of byPriority) {
    if (chosen.size >= max) break;
    chosen.add(index);
  }
  return candidates.filter((_, index) => chosen.has(index));
}

export function uncoveredSections(sectionCount: number, keyNotions: { sectionIndex: number }[]): number[] {
  const covered = new Set(keyNotions.map((k) => k.sectionIndex));
  return Array.from({ length: sectionCount }, (_, index) => index).filter((index) => !covered.has(index));
}

export function cardTargets(keyNotions: Pick<KeyNotionCandidate, "importance" | "isSynthesis">[], budget: CardBudget): CardTargets {
  const indices = keyNotions.map((_, index) => index);
  return {
    flashcard: indices.slice(0, budget.keyNotions.max),
    mcq: indices.filter((index) => keyNotions[index]?.importance === "essential").slice(0, budget.mcq.max),
    open: indices.filter((index) => keyNotions[index]?.isSynthesis === true).slice(0, budget.open.max),
  };
}

// The hard caps, applied to what the model actually returned: only targeted
// key notions, one card per key notion and type, never more than the total
// cap (flashcards first, the order the budget favours).
export function capGeneratedCards(cards: PlannedCard[], targets: CardTargets): PlannedCard[] {
  const seen = new Set<string>();
  const kept = cards.filter((card) => {
    const key = `${card.type}:${String(card.keyNotionIndex)}`;
    if (!targets[card.type].includes(card.keyNotionIndex) || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const order: CardType[] = ["flashcard", "mcq", "open"];
  return order.flatMap((type) => kept.filter((card) => card.type === type)).slice(0, CARD_BUDGET.totalCardCap);
}
