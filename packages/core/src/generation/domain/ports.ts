import type { Difficulty } from "../../content/index.js";
import type { Result } from "../../shared/index.js";
import type { CardBudget } from "./card-budget.js";
import type { KeyNotionCandidate, PlannedCard } from "./key-notion-plan.js";
import type { Card, CardType, GeneratedCard, KeyNotion, KeyNotionCardLink } from "./types.js";

export type GenerationError = { kind: "model-error"; message: string };

export interface CardGenerator {
  generate(input: {
    notion: { title: string; body: string; difficulty: Difficulty };
    types: CardType[];
  }): Promise<Result<GeneratedCard[], GenerationError>>;
}

// Not in docs/modules/generation.md's Ports section (only CardGenerator is
// listed there), but required by its own Use cases list, same reasoning as
// content's NotionRepository. Every method takes userId and filters on it.
export interface CardRepository {
  listCards(userId: string, notionId: string): Promise<Card[]>;
  findCard(userId: string, cardId: string): Promise<Card | null>;
  // Applies a diff-cards.ts plan in one write: `upsert` is written by id
  // (an unchanged id is an update in place, preserving its reviews; a new
  // id is an insert), then `deleteIds` are removed (cascading to their
  // reviews, docs/modules/generation.md).
  applyCardChanges(userId: string, notionId: string, upsert: Card[], deleteIds: string[]): Promise<void>;
  deleteCard(userId: string, cardId: string): Promise<boolean>;
  // Called when a notion's body changes (docs/modules/generation.md):
  // flips every active card of that notion to 'stale'.
  markStale(userId: string, notionId: string): Promise<void>;
}

// M11's own persistence (docs/reports/notions-cles-conception.md), kept off
// CardRepository on purpose: review and progress each fake that interface.
export interface KeyNotionRepository {
  // Ordered by position; each one's readingNotionIds in course order.
  listKeyNotions(userId: string, documentId: string): Promise<KeyNotion[]>;
  // Key notions and their reading-notion sources, in one write.
  saveKeyNotions(userId: string, keyNotions: KeyNotion[]): Promise<void>;
  // Every card of the course, whichever flow created it.
  countCardsForDocument(userId: string, documentId: string): Promise<number>;
  // Cards and their key-notion links, in one write.
  saveCourseCards(userId: string, cards: Card[], links: KeyNotionCardLink[]): Promise<void>;
}

// M11: one call over the whole course (docs/reports/notions-cles-conception.md).
// The adapter resolves its own short references back to readingNotions ids,
// validates (every section covered, every key notion tied to at least one
// reading notion) and retries once with the error fed back (CLAUDE.md rule 4).
export type KeyNotionExtractionInput = {
  markdown: string;
  readingNotions: { id: string; title: string }[];
  budget: CardBudget;
};
export type KeyNotionExtraction = { sections: string[]; keyNotions: KeyNotionCandidate[] };
// "truncated": the output hit the call's token limit; the same input would
// truncate again, so the job fails for good instead of paying again.
export type KeyNotionExtractionError = { kind: "model-error" | "truncated"; message: string };

export interface KeyNotionExtractor {
  extract(input: KeyNotionExtractionInput): Promise<Result<KeyNotionExtraction, KeyNotionExtractionError>>;
}

// M11: one call per card type and batch of key notions. `index` is the key
// notion's position in the course's list and comes back on each card. Every
// returned card has passed its type's invariants; a key notion left without
// a valid card is asked for again once, then the call fails.
export type CardBatchInput = {
  type: CardType;
  keyNotions: { index: number; title: string; summary: string; readingNotionIds: string[] }[];
  readingNotions: { id: string; title: string; body: string }[];
};

export interface KeyNotionCardGenerator {
  generate(input: CardBatchInput): Promise<Result<PlannedCard[], GenerationError>>;
}
