import { err, ok, type Result } from "../../shared/index.js";
import type { AnswerGrader, GradeError } from "../domain/ports.js";
import type { Rating } from "../domain/types.js";

export type FixtureCase = "correct" | "paraphrased-correct" | "incorrect" | "partial" | "model-error";

// The adapter that actually runs in pnpm test (CLAUDE.md rule 3): a port
// gets a real adapter and a fixture adapter, and no test hits the network.
export class FixtureAnswerGrader implements AnswerGrader {
  constructor(private readonly fixtureCase: FixtureCase = "correct") {}

  grade(_input: {
    question: string;
    expected: string;
    given: string;
  }): Promise<Result<{ correct: boolean; feedback: string; suggestedRating: Rating }, GradeError>> {
    switch (this.fixtureCase) {
      case "correct":
      case "paraphrased-correct":
        return Promise.resolve(ok({ correct: true, feedback: "Bonne réponse.", suggestedRating: 3 }));
      case "partial":
        return Promise.resolve(ok({ correct: true, feedback: "Correct, mais incomplet.", suggestedRating: 2 }));
      case "incorrect":
        return Promise.resolve(ok({ correct: false, feedback: "Ce n'est pas tout à fait ça.", suggestedRating: 1 }));
      case "model-error":
        return Promise.resolve(err({ kind: "model-error", message: "grading failed" }));
    }
  }
}
