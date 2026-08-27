import type { Card, GeneratedCard } from "./types.js";

export type CardDiffAction = { action: "keep"; id: string; generated: GeneratedCard } | { action: "insert"; generated: GeneratedCard };

// Deleting a card cascades to its reviews, which destroys scheduling
// history. Regeneration must replace cards by id where the question is
// unchanged, and only insert or delete where it actually differs
// (docs/modules/generation.md). Matched by (type, question); each existing
// card is consumed at most once.
export function diffCards(existing: Card[], generated: GeneratedCard[]): { actions: CardDiffAction[]; deleteIds: string[] } {
  const remaining = [...existing];
  const actions: CardDiffAction[] = [];

  for (const item of generated) {
    const matchIndex = remaining.findIndex((card) => card.type === item.type && card.question === item.question);
    if (matchIndex === -1) {
      actions.push({ action: "insert", generated: item });
    } else {
      const [matched] = remaining.splice(matchIndex, 1);
      actions.push({ action: "keep", id: matched!.id, generated: item });
    }
  }

  return { actions, deleteIds: remaining.map((card) => card.id) };
}
