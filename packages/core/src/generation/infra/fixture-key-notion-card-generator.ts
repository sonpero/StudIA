import { err, ok, type Result } from "../../shared/index.js";
import type { PlannedCard } from "../domain/key-notion-plan.js";
import type { CardBatchInput, GenerationError, KeyNotionCardGenerator } from "../domain/ports.js";

export type FixtureCase = "valid" | "degraded" | "empty" | "schema-violation" | "refine-violation";

// Deterministic cards, numbered by the key notion's position plus one, so
// e2e can read the number off the question and pick the matching answer:
// "Question N ?" (flashcard), "QCM N ?" with the correct option
// "Bonne réponse N" (mcq), "Question ouverte N ?" (open).
function cardFor(type: CardBatchInput["type"], index: number): PlannedCard {
  const n = String(index + 1);
  if (type === "mcq") {
    return {
      keyNotionIndex: index,
      type,
      question: `QCM ${n} ?`,
      answer: `Bonne réponse ${n}`,
      options: [`Bonne réponse ${n}`, `Distracteur A${n}`, `Distracteur B${n}`, `Distracteur C${n}`],
    };
  }
  if (type === "open") return { keyNotionIndex: index, type, question: `Question ouverte ${n} ?`, answer: `Réponse modèle ${n}`, options: null };
  return { keyNotionIndex: index, type, question: `Question ${n} ?`, answer: `Réponse ${n}`, options: null };
}

export class FixtureKeyNotionCardGenerator implements KeyNotionCardGenerator {
  constructor(private readonly fixtureCase: FixtureCase = "valid") {}

  generate(input: CardBatchInput): Promise<Result<PlannedCard[], GenerationError>> {
    const cards = input.keyNotions.map((keyNotion) => cardFor(input.type, keyNotion.index));
    switch (this.fixtureCase) {
      case "valid":
        return Promise.resolve(ok(cards));
      case "degraded":
        return Promise.resolve(ok(cards.slice(0, 1)));
      case "empty":
        return Promise.resolve(ok([]));
      case "schema-violation":
        return Promise.resolve(err({ kind: "model-error", message: "schema validation failed after 1 retry" }));
      case "refine-violation":
        return Promise.resolve(err({ kind: "model-error", message: "output failed a domain invariant (refine), after 1 retry" }));
    }
  }
}
