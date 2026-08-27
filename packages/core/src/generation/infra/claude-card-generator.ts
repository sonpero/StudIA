import { generateObject, type LanguageModel } from "ai";
import { z } from "zod";
import { err, ok, type Result } from "../../shared/index.js";
import type { Difficulty } from "../../content/index.js";
import { isValidCardCount } from "../domain/is-valid-card-count.js";
import { questionLeaksAnswer } from "../domain/question-leaks-answer.js";
import type { CardGenerator, GenerationError } from "../domain/ports.js";
import type { CardType, GeneratedCard } from "../domain/types.js";

// One schema per card type, one call per type (CLAUDE.md, docs/modules/
// generation.md): a discriminated union across shapes degrades reliability.
// M3 only ever implements 'flashcard' — mcq and open are M4.
const flashcardSchema = z.object({
  question: z.string().describe("One clear question testing this notion. One sentence, not a list."),
  answer: z.string().describe("A short, direct answer to the question."),
});

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// The answer-among-options invariant does not apply here: flashcards have
// no options (Card.options is mcq-only, docs/modules/generation.md). It
// becomes required once mcq's own schema is added in M4.
function assertNoInvariantViolation(cards: GeneratedCard[]): void {
  if (!isValidCardCount(cards.length)) {
    throw new Error(`Generated ${String(cards.length)} cards, expected 1 to 5`);
  }
  const leaking = cards.find((c) => questionLeaksAnswer(c.question, c.answer));
  if (leaking) throw new Error(`Question leaks its answer: "${leaking.question}"`);
}

const PROMPT_PREFIX =
  "Génère des flashcards de révision pour cette notion : une question claire au recto, " +
  "une réponse courte et directe au verso. La question ne doit jamais contenir la réponse. " +
  "Entre 1 et 5 cartes selon la difficulté de la notion (moins pour une notion facile, plus pour une difficile).";

// Never called by pnpm test: this is the real adapter, exercised only by
// pnpm eval (manual, costs money) and in production (CLAUDE.md rule 3).
export class ClaudeCardGenerator implements CardGenerator {
  constructor(private readonly model: LanguageModel) {}

  async generate(input: {
    notion: { title: string; body: string; difficulty: Difficulty };
    types: CardType[];
  }): Promise<Result<GeneratedCard[], GenerationError>> {
    const unsupported = input.types.find((type) => type !== "flashcard");
    if (unsupported) {
      return err({ kind: "unsupported-type", message: `Card type "${unsupported}" is not generated until M4` });
    }
    if (input.types.length === 0) return ok([]);

    const prompt =
      `${PROMPT_PREFIX}\n\nDifficulté : ${input.notion.difficulty}.\n\n` +
      `# ${input.notion.title}\n\n${input.notion.body}`;

    const attempt = async (extraContext?: string): Promise<GeneratedCard[]> => {
      const { object } = await generateObject({
        model: this.model,
        output: "array",
        schema: flashcardSchema,
        prompt: extraContext ? `${prompt}\n\n${extraContext}` : prompt,
      });
      const cards: GeneratedCard[] = object.map((c) => ({ type: "flashcard", question: c.question, answer: c.answer, options: null }));
      assertNoInvariantViolation(cards);
      return cards;
    };

    try {
      return ok(await attempt());
    } catch (firstError) {
      // Retry once with the validation error fed back to the model, then
      // fail (CLAUDE.md rule 4).
      try {
        return ok(
          await attempt(`Ta réponse précédente n'a pas respecté le format attendu : ${describeError(firstError)}. Corrige et réessaie.`),
        );
      } catch (secondError) {
        return err({ kind: "model-error", message: describeError(secondError) });
      }
    }
  }
}
