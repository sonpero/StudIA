import type { Difficulty } from "../../content/index.js";
import type { Result } from "../../shared/index.js";
import type { Card, CardType, GeneratedCard } from "./types.js";

export type GenerationError =
  | { kind: "model-error"; message: string }
  | { kind: "unsupported-type"; message: string };

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
