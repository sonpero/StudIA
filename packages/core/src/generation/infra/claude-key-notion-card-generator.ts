import { generateObject, type LanguageModel } from "ai";
import { z } from "zod";
import { err, ok, type Result } from "../../shared/index.js";
import type { PlannedCard } from "../domain/key-notion-plan.js";
import { answerAmongOptions, areOptionsDistinct, optionLengthsArePlausible, optionsArePositionIndependent } from "../domain/mcq-invariants.js";
import type { CardBatchInput, GenerationError, KeyNotionCardGenerator } from "../domain/ports.js";
import { questionLeaksAnswer } from "../domain/question-leaks-answer.js";
import type { CardType } from "../domain/types.js";

// One schema per card type (docs/modules/generation.md: no union across
// shapes), one flat object per card. The invariants are not .refine()s
// here: they are checked per card below, so one bad card is asked for again
// on its own instead of failing its whole batch.
const keyNotionRef = z.string().describe("Référence (K…) de la notion clé interrogée, telle qu'elle apparaît dans la liste.");
const schemas = {
  flashcard: z.object({
    keyNotion: keyNotionRef,
    question: z.string().describe("Une question claire sur cette notion clé. Une phrase, pas une liste."),
    answer: z.string().describe("Une réponse courte et directe."),
  }),
  mcq: z.object({
    keyNotion: keyNotionRef,
    question: z.string().describe("Une question claire sur cette notion clé. Une phrase, pas une liste."),
    options: z
      .array(z.string())
      .describe("Exactement quatre options, dont la bonne réponse. Les distracteurs sont plausibles et de longueur comparable à la bonne réponse."),
    answer: z.string().describe("Exactement le texte de l'une des quatre options."),
  }),
  open: z.object({
    keyNotion: keyNotionRef,
    question: z.string().describe("Une question qui appelle une réponse rédigée courte, reliant plusieurs idées du cours. Une phrase."),
    answer: z.string().describe("Une réponse modèle, qui servira de référence pour corriger la réponse de l'élève."),
  }),
};

// A batch is at most 15 key notions (CARD_BUDGET.batchSize); an MCQ, the
// largest card, is ~150 output tokens. 8 000 is several times that.
export const CARD_BATCH_MAX_TOKENS = 8_000;

const INSTRUCTION: Record<CardType, string> = {
  flashcard:
    "Génère exactement une flashcard par notion clé de la liste : une question claire au recto, une réponse courte et directe au verso.",
  mcq:
    "Génère exactement une question à choix multiples (QCM) par notion clé de la liste : une question, quatre options dont une seule correcte, " +
    "et le texte exact de la bonne réponse. Les distracteurs sont plausibles : même catégorie que la bonne réponse, longueur comparable, jamais absurdes. " +
    "Chaque option se comprend seule, quelle que soit sa place : jamais « toutes les réponses ci-dessus », « aucune des réponses », « A et B » ni « les deux premières ».",
  open:
    "Génère exactement une question ouverte par notion clé de la liste : une question qui appelle une réponse rédigée courte, et une réponse modèle " +
    "qui servira de référence pour corriger la réponse de l'élève.",
};

const COMMON_RULES =
  "Interroge ce que la notion clé dit d'essentiel, en t'appuyant uniquement sur les extraits du cours fournis. " +
  "La question ne doit jamais contenir la réponse. Indique pour chaque carte la référence K… de sa notion clé.";

type RawCard = { keyNotion: string; question: string; answer: string; options?: string[] };

function refOf(index: number): string {
  return `K${String(index + 1)}`;
}

function promptFor(input: CardBatchInput): string {
  const sourceRef = new Map(input.readingNotions.map((notion, index) => [notion.id, `L${String(index + 1)}`]));
  const keyNotions = input.keyNotions
    .map((keyNotion) => {
      const sources = keyNotion.readingNotionIds.map((id) => sourceRef.get(id)).filter((ref): ref is string => ref !== undefined);
      return `${refOf(keyNotion.index)} — ${keyNotion.title} : ${keyNotion.summary} (extraits : ${sources.join(", ")})`;
    })
    .join("\n");
  const sources = input.readingNotions.map((notion, index) => `## L${String(index + 1)} — ${notion.title}\n\n${notion.body}`).join("\n\n");
  return `${INSTRUCTION[input.type]} ${COMMON_RULES}\n\nNotions clés :\n${keyNotions}\n\n---\n\nExtraits du cours :\n\n${sources}`;
}

// null when the card is valid, otherwise the reason, fed back on the retry.
function problemWith(type: CardType, card: RawCard): string | null {
  if (card.question.trim() === "" || card.answer.trim() === "") return "question ou réponse vide";
  if (questionLeaksAnswer(card.question, card.answer)) return "la question contient la réponse";
  if (type !== "mcq") return null;
  const options = card.options ?? [];
  if (options.length !== 4) return `il faut exactement quatre options, pas ${String(options.length)}`;
  if (!answerAmongOptions(card.answer, options)) return "la bonne réponse ne figure pas parmi les options";
  if (!areOptionsDistinct(options)) return "les quatre options doivent être distinctes";
  if (!optionLengthsArePlausible(options)) return "un distracteur est beaucoup plus court ou plus long que les autres options";
  if (!optionsArePositionIndependent(options)) return "une option dépend de la place des autres (« ci-dessus », « A et B »…)";
  return null;
}

function toPlanned(type: CardType, index: number, card: RawCard): PlannedCard {
  if (type !== "mcq") return { keyNotionIndex: index, type, question: card.question.trim(), answer: card.answer.trim(), options: null };
  const options = (card.options ?? []).map((option) => option.trim());
  const normalizedAnswer = card.answer.trim().toLowerCase();
  const answer = options.find((option) => option.toLowerCase() === normalizedAnswer) ?? card.answer.trim();
  return { keyNotionIndex: index, type, question: card.question.trim(), answer, options };
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// Never called by pnpm test: this is the real adapter, exercised only by
// pnpm eval (manual, costs money) and in production (CLAUDE.md rule 3).
export class ClaudeKeyNotionCardGenerator implements KeyNotionCardGenerator {
  constructor(private readonly model: LanguageModel) {}

  async generate(input: CardBatchInput): Promise<Result<PlannedCard[], GenerationError>> {
    const kept = new Map<number, PlannedCard>();
    const problems = new Map<number, string>();

    // Keeps the first valid card per key notion of `batch`; records why the
    // others have none.
    const collect = (batch: CardBatchInput, raw: RawCard[]) => {
      const indexByRef = new Map(batch.keyNotions.map((keyNotion) => [refOf(keyNotion.index), keyNotion.index]));
      for (const card of raw) {
        const index = indexByRef.get(card.keyNotion.trim());
        if (index === undefined || kept.has(index)) continue;
        const problem = problemWith(input.type, card);
        if (problem) problems.set(index, problem);
        else {
          kept.set(index, toPlanned(input.type, index, card));
          problems.delete(index);
        }
      }
      for (const keyNotion of batch.keyNotions) {
        if (!kept.has(keyNotion.index) && !problems.has(keyNotion.index)) problems.set(keyNotion.index, "aucune carte rendue pour cette notion clé");
      }
    };
    const call = async (batch: CardBatchInput, extraContext?: string): Promise<RawCard[]> => {
      const prompt = promptFor(batch);
      const { object } = await generateObject({
        model: this.model,
        output: "array",
        schema: schemas[input.type],
        prompt: extraContext ? `${prompt}\n\n${extraContext}` : prompt,
        maxTokens: CARD_BATCH_MAX_TOKENS,
      });
      return object;
    };

    let feedback: string;
    try {
      collect(input, await call(input));
      if (problems.size === 0) return ok([...kept.values()]);
      feedback = [...problems].map(([index, problem]) => `${refOf(index)} : ${problem}`).join(" ; ");
    } catch (error) {
      feedback = describeError(error);
    }

    // Retry once (CLAUDE.md rule 4), only for the key notions still without
    // a valid card, with the reasons fed back.
    const remaining = input.keyNotions.filter((keyNotion) => !kept.has(keyNotion.index));
    const remainingSources = new Set(remaining.flatMap((keyNotion) => keyNotion.readingNotionIds));
    const retryBatch: CardBatchInput = {
      ...input,
      keyNotions: remaining,
      readingNotions: input.readingNotions.filter((notion) => remainingSources.has(notion.id)),
    };
    try {
      collect(retryBatch, await call(retryBatch, `Ta réponse précédente n'a pas respecté le format attendu : ${feedback}. Corrige et réessaie.`));
    } catch (error) {
      return err({ kind: "model-error", message: describeError(error) });
    }
    if (problems.size > 0) {
      return err({ kind: "model-error", message: `No valid ${input.type} card after one retry: ${[...problems].map(([index, problem]) => `${refOf(index)} (${problem})`).join("; ")}` });
    }
    // First-call cards first, then the retried ones.
    return ok([...kept.values()]);
  }
}
