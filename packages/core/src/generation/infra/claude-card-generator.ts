import { generateObject, type LanguageModel } from "ai";
import { z } from "zod";
import { err, ok, type Result } from "../../shared/index.js";
import type { Difficulty } from "../../content/index.js";
import { isValidCardCount } from "../domain/is-valid-card-count.js";
import { answerAmongOptions, areOptionsDistinct, optionLengthsArePlausible } from "../domain/mcq-invariants.js";
import { questionLeaksAnswer } from "../domain/question-leaks-answer.js";
import type { CardGenerator, GenerationError } from "../domain/ports.js";
import type { CardType, GeneratedCard } from "../domain/types.js";

// One schema per card type, one call per type (CLAUDE.md, docs/modules/
// generation.md): a discriminated union across shapes degrades reliability.
const flashcardSchema = z.object({
  question: z.string().describe("One clear question testing this notion. One sentence, not a list."),
  answer: z.string().describe("A short, direct answer to the question."),
});

// The "answer among options" refine is the single most valuable one in the
// project (docs/modules/generation.md): models get it wrong often enough to
// matter, and it is free. Distinctness and length-plausibility are checked
// the same way, so every violation goes through the same retry-once path.
const mcqSchema = z
  .object({
    question: z.string().describe("One clear question testing this notion. One sentence, not a list."),
    options: z.array(z.string()).length(4).describe("Exactly four answer options, in any order, including the correct one."),
    answer: z.string().describe("Must be exactly equal, character for character, to one of the four options."),
  })
  .refine((data) => answerAmongOptions(data.answer, data.options), {
    message: "the answer must be exactly one of the four options",
    path: ["answer"],
  })
  .refine((data) => areOptionsDistinct(data.options), {
    message: "the four options must be distinct from one another",
    path: ["options"],
  })
  .refine((data) => optionLengthsArePlausible(data.options), {
    message: "distractors must be comparable in length to the correct answer (a wildly shorter or longer option gives it away)",
    path: ["options"],
  });

const openSchema = z.object({
  question: z.string().describe("One clear question testing this notion, requiring a short written answer. One sentence, not a list."),
  answer: z.string().describe("A model answer used as the grading reference. The learner's own answer does not need to match it verbatim."),
});

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// Invariants shared by every card type, regardless of schema (mcq's own
// invariants are already enforced by mcqSchema's .refine() above, so they
// don't need repeating here).
function assertNoInvariantViolation(cards: GeneratedCard[]): void {
  if (!isValidCardCount(cards.length)) {
    throw new Error(`Generated ${String(cards.length)} cards, expected 1 to 5`);
  }
  const leaking = cards.find((c) => questionLeaksAnswer(c.question, c.answer));
  if (leaking) throw new Error(`Question leaks its answer: "${leaking.question}"`);
}

const DIFFICULTY_HINT =
  "Entre 1 et 5 cartes selon la difficulté de la notion (moins pour une notion facile, plus pour une difficile).";

function promptFor(type: CardType, notion: { title: string; body: string; difficulty: Difficulty }): string {
  const instruction =
    type === "flashcard"
      ? "Génère des flashcards de révision pour cette notion : une question claire au recto, une réponse courte et directe au verso. La question ne doit jamais contenir la réponse."
      : type === "mcq"
        ? "Génère des questions à choix multiples (QCM) pour cette notion : une question, quatre options dont une seule correcte, et l'énoncé de la bonne réponse. Les distracteurs doivent être plausibles : même catégorie que la bonne réponse, longueur comparable, jamais absurdes. La question ne doit jamais contenir la réponse."
        : "Génère des questions ouvertes pour cette notion : une question appelant une réponse rédigée courte, et une réponse modèle qui servira de référence pour corriger la réponse de l'apprenant. La question ne doit jamais contenir la réponse.";
  return `${instruction} ${DIFFICULTY_HINT}\n\nDifficulté : ${notion.difficulty}.\n\n# ${notion.title}\n\n${notion.body}`;
}

// Never called by pnpm test: this is the real adapter, exercised only by
// pnpm eval (manual, costs money) and in production (CLAUDE.md rule 3).
export class ClaudeCardGenerator implements CardGenerator {
  constructor(private readonly model: LanguageModel) {}

  async generate(input: {
    notion: { title: string; body: string; difficulty: Difficulty };
    types: CardType[];
  }): Promise<Result<GeneratedCard[], GenerationError>> {
    const allCards: GeneratedCard[] = [];
    for (const type of input.types) {
      const result = await this.generateOneType(type, input.notion);
      if (!result.ok) return result;
      allCards.push(...result.value);
    }
    return ok(allCards);
  }

  private async generateOneType(
    type: CardType,
    notion: { title: string; body: string; difficulty: Difficulty },
  ): Promise<Result<GeneratedCard[], GenerationError>> {
    const prompt = promptFor(type, notion);

    const attempt = async (extraContext?: string): Promise<GeneratedCard[]> => {
      const fullPrompt = extraContext ? `${prompt}\n\n${extraContext}` : prompt;
      let cards: GeneratedCard[];
      if (type === "mcq") {
        const { object } = await generateObject({ model: this.model, output: "array", schema: mcqSchema, prompt: fullPrompt });
        cards = object.map((c) => ({ type: "mcq", question: c.question, answer: c.answer, options: c.options }));
      } else if (type === "open") {
        const { object } = await generateObject({ model: this.model, output: "array", schema: openSchema, prompt: fullPrompt });
        cards = object.map((c) => ({ type: "open", question: c.question, answer: c.answer, options: null }));
      } else {
        const { object } = await generateObject({ model: this.model, output: "array", schema: flashcardSchema, prompt: fullPrompt });
        cards = object.map((c) => ({ type: "flashcard", question: c.question, answer: c.answer, options: null }));
      }
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
