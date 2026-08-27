import { err, ok, type Result } from "../../shared/index.js";
import type { Difficulty } from "../../content/index.js";
import type { CardGenerator, GenerationError } from "../domain/ports.js";
import type { CardType, GeneratedCard } from "../domain/types.js";

export type FixtureCase = "valid" | "degraded" | "empty" | "schema-violation" | "refine-violation";

function threeValidFlashcards(): GeneratedCard[] {
  return Array.from({ length: 3 }, (_, i) => ({
    type: "flashcard",
    question: `Question ${String(i + 1)} ?`,
    answer: `Réponse ${String(i + 1)}`,
    options: null,
  }));
}

// The adapter that actually runs in pnpm test (CLAUDE.md rule 3): a port
// gets a real adapter and a fixture adapter, and no test hits the network.
// The five required cases per docs/TESTING.md.
export class FixtureCardGenerator implements CardGenerator {
  constructor(private readonly fixtureCase: FixtureCase = "valid") {}

  generate(_input: {
    notion: { title: string; body: string; difficulty: Difficulty };
    types: CardType[];
  }): Promise<Result<GeneratedCard[], GenerationError>> {
    switch (this.fixtureCase) {
      case "valid":
        return Promise.resolve(ok(threeValidFlashcards()));
      case "degraded":
        return Promise.resolve(ok(threeValidFlashcards().slice(0, 1)));
      case "empty":
        return Promise.resolve(ok([]));
      case "schema-violation":
        return Promise.resolve(err({ kind: "model-error", message: "schema validation failed after 1 retry" }));
      case "refine-violation":
        return Promise.resolve(err({ kind: "model-error", message: "output failed a domain invariant (refine)" }));
    }
  }
}
