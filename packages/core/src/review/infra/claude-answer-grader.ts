import { generateObject, type LanguageModel } from "ai";
import { z } from "zod";
import { err, ok, type Result } from "../../shared/index.js";
import type { AnswerGrader, GradeError } from "../domain/ports.js";
import type { Rating } from "../domain/types.js";

// Bucketed verdict, not a raw 1-4 number (CLAUDE.md: constraints belong in
// .describe(), and a bounded enum is far more reliable than asking a model
// for a bare integer). Mapped to FSRS ratings below — confirmed product
// mapping: again=1, hard=2, good=3, easy=4.
const gradeSchema = z.object({
  correct: z.boolean().describe("Whether the learner's answer is substantively correct, even if phrased differently from the model answer."),
  feedback: z.string().describe("One short sentence of feedback for the learner, in French."),
  verdict: z
    .enum(["again", "hard", "good", "easy"])
    .describe(
      "again: wrong, or shows no real understanding. hard: correct but hesitant or missing a detail. good: correct and clear. easy: correct, clear, and complete — better than a typical answer.",
    ),
});

const VERDICT_TO_RATING: Record<z.infer<typeof gradeSchema>["verdict"], Rating> = { again: 1, hard: 2, good: 3, easy: 4 };

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

const PROMPT_PREFIX =
  "Corrige la réponse de l'apprenant à cette question de révision. La réponse attendue est un exemple de bonne " +
  "réponse, pas la seule formulation acceptable : marque correct=true si la réponse de l'apprenant est " +
  "substantiellement juste, même reformulée différemment. Donne un verdict (again/hard/good/easy) reflétant la " +
  "qualité de la réponse, et une phrase de feedback courte.";

// Never called by pnpm test: this is the real adapter, exercised only by
// pnpm eval (manual, costs money) and in production (CLAUDE.md rule 3).
export class ClaudeAnswerGrader implements AnswerGrader {
  constructor(private readonly model: LanguageModel) {}

  async grade(input: {
    question: string;
    expected: string;
    given: string;
  }): Promise<Result<{ correct: boolean; feedback: string; suggestedRating: Rating }, GradeError>> {
    const prompt =
      `${PROMPT_PREFIX}\n\nQuestion : ${input.question}\nRéponse attendue : ${input.expected}\nRéponse de l'apprenant : ${input.given}`;

    const attempt = async (extraContext?: string) => {
      const { object } = await generateObject({
        model: this.model,
        schema: gradeSchema,
        prompt: extraContext ? `${prompt}\n\n${extraContext}` : prompt,
      });
      return object;
    };

    try {
      const object = await attempt();
      return ok({ correct: object.correct, feedback: object.feedback, suggestedRating: VERDICT_TO_RATING[object.verdict] });
    } catch (firstError) {
      // Retry once with the validation error fed back to the model, then
      // fail (CLAUDE.md rule 4).
      try {
        const object = await attempt(
          `Ta réponse précédente n'a pas respecté le format attendu : ${describeError(firstError)}. Corrige et réessaie.`,
        );
        return ok({ correct: object.correct, feedback: object.feedback, suggestedRating: VERDICT_TO_RATING[object.verdict] });
      } catch (secondError) {
        return err({ kind: "model-error", message: describeError(secondError) });
      }
    }
  }
}
