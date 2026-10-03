import { generateObject, NoObjectGeneratedError, type LanguageModel } from "ai";
import { z } from "zod";
import { unwrapStringifiedJson } from "../../content/index.js";
import { err, ok, type Result } from "../../shared/index.js";
import { uncoveredSections, type KeyNotionCandidate } from "../domain/key-notion-plan.js";
import type { KeyNotionExtraction, KeyNotionExtractionError, KeyNotionExtractionInput, KeyNotionExtractor } from "../domain/ports.js";

// One object holding two flat arrays: the sections, and the key notions as
// six-field objects that point at a section by index (CLAUDE.md: flat,
// shallow, no union). .min()/.max() are not sent to the model; every
// constraint it needs is in .describe() or the prompt.
const keyNotionSchema = z.object({
  title: z.string().describe("Groupe nominal court nommant la notion clé, 3 à 80 caractères. Jamais une question."),
  importance: z
    .enum(["essential", "important"])
    .describe("essential : sans elle, le cours n'est pas compris. important : à savoir, mais pas au cœur du cours."),
  synthesis: z
    .boolean()
    .describe("true si la notion relie plusieurs idées du cours (comparaison, cause et conséquence, démarche d'ensemble) et appelle une réponse rédigée."),
  section: z.number().int().describe("Index, à partir de 0, de la partie du cours (dans la liste sections) où se trouve cette notion."),
  summary: z.string().describe("Ce qu'il faut retenir, en une phrase, 120 caractères au plus."),
  readingNotions: z
    .array(z.string())
    .describe("Références (L1, L2…) des notions de lecture qui contiennent la matière de cette notion clé : au moins une, trois au plus, les plus pertinentes."),
});

const extractionSchema = z.object({
  sections: z.array(z.string()).describe("Les grandes parties du cours, dans l'ordre, avec leur titre tel qu'il apparaît dans le cours."),
  keyNotions: z.array(keyNotionSchema).describe("Les notions clés du cours, dans l'ordre du cours."),
});

// Output budget. The largest budget asks for 90 key notions; each one is a
// title, a summary of at most 120 characters and at most three references:
// the 25-page eval measured ~115 output tokens a key notion with 200-
// character summaries, so ~90 tokens now, ~8 000 for 90, plus the sections.
// 16 000 leaves ~1.7x headroom and stays at the comfortable ceiling of a
// non-streamed call (same reasoning as content's SPLITTER_MAX_TOKENS).
export const KEY_NOTION_EXTRACTOR_MAX_TOKENS = 16_000;

// Never more sections than the fewest key notions allowed, so every section
// can get one; and a dozen-odd at most, the scale of a course's chapters.
const MAX_SECTIONS = 15;

class TruncatedOutputError extends Error {}

// The SDK's own message is only "response did not match schema"; its cause
// carries the validation issues, which is what the retry needs to name.
function describeError(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  return error.cause instanceof Error ? `${error.message} ${error.cause.message}` : error.message;
}

const PROMPT_PREFIX =
  "Tu reçois un cours complet et la liste de ses notions de lecture. Identifie ses notions clés : " +
  "ce qu'un élève doit savoir et pouvoir restituer après avoir étudié ce cours. Chaque notion clé " +
  "porte sur une seule idée, et deux notions clés n'interrogent jamais la même chose. Ne retiens " +
  "aucune notion secondaire (anecdote, détail d'illustration, exemple isolé).";

// Rules added after the first real eval (2026-10-03,
// docs/reports/notions-cles-decisions.md D17): the model left out
// `sections` on a first attempt, stopped at one key notion per reading
// notion below the budget's minimum, and flagged a table to recite as a
// synthesis notion.
function promptFor(input: KeyNotionExtractionInput): string {
  const { keyNotions, mcq, open } = input.budget;
  const maxSections = Math.min(keyNotions.min, MAX_SECTIONS);
  const notionList = input.readingNotions.map((notion, index) => `L${String(index + 1)} — ${notion.title}`).join("\n");
  return [
    PROMPT_PREFIX,
    "Ta réponse contient deux champs, tous deux obligatoires : sections, puis keyNotions.",
    `Produis entre ${String(keyNotions.min)} et ${String(keyNotions.max)} notions clés, jamais moins de ${String(keyNotions.min)} et jamais plus de ${String(keyNotions.max)} : vise le bas de la fourchette pour un cours peu dense ou répétitif, le haut pour un cours dense.`,
    // A course with few reading notions needs splitting to reach the
    // minimum; one with many (a long course) needs grouping, or the output
    // overruns the call's token limit (D18: a 67-page course truncated).
    input.readingNotions.length <= keyNotions.min
      ? "Une notion de lecture contient souvent plusieurs notions clés (une définition, un mécanisme, une règle, une distinction) : ne te limite pas à une notion clé par notion de lecture."
      : "Une notion clé peut regrouper plusieurs notions de lecture : garde ce qui compte le plus, ne fais pas une notion clé par notion de lecture.",
    `Parmi elles, entre ${String(mcq.min)} et ${String(mcq.max)} sont essentielles (importance « essential »), les autres importantes.`,
    `Entre ${String(open.min)} et ${String(open.max)} sont des notions de synthèse (synthesis à true) : une synthèse relie plusieurs idées du cours (comparaison, cause et conséquence, choix entre deux options, démarche d'ensemble) et se raisonne. Un tableau ou une liste à restituer n'est pas une synthèse.`,
    `Liste d'abord les grandes parties du cours (entre 1 et ${String(maxSections)}), dans l'ordre. Chaque partie doit avoir au moins une notion clé.`,
    "Pour chaque notion clé, donne les références des notions de lecture qui en contiennent la matière (au moins une).",
    `Notions de lecture :\n${notionList}`,
    `---\n\n${input.markdown}`,
  ].join("\n\n");
}

type RawExtraction = z.infer<typeof extractionSchema>;

// The checks the schema cannot carry, enforced by hand and funnelled into
// the same retry-once path as a schema violation (CLAUDE.md rule 4).
// Unknown references are dropped silently: only a key notion left with
// none is an error.
function resolve(raw: RawExtraction, input: KeyNotionExtractionInput): KeyNotionExtraction {
  const idByRef = new Map(input.readingNotions.map((notion, index) => [`L${String(index + 1)}`, notion.id]));
  const problems: string[] = [];
  const keyNotions: KeyNotionCandidate[] = raw.keyNotions.map((keyNotion) => {
    const readingNotionIds = [...new Set(keyNotion.readingNotions.map((ref) => idByRef.get(ref.trim())).filter((id): id is string => id !== undefined))];
    if (readingNotionIds.length === 0) problems.push(`la notion clé « ${keyNotion.title} » ne cite aucune notion de lecture valide (L1 à L${String(input.readingNotions.length)})`);
    if (!Number.isInteger(keyNotion.section) || keyNotion.section < 0 || keyNotion.section >= raw.sections.length) {
      problems.push(`la notion clé « ${keyNotion.title} » désigne la partie ${String(keyNotion.section)}, absente de la liste des parties`);
    }
    if (keyNotion.title.trim().length < 3) problems.push(`le titre « ${keyNotion.title} » est trop court`);
    return {
      title: keyNotion.title.trim(),
      summary: keyNotion.summary.trim(),
      importance: keyNotion.importance,
      isSynthesis: keyNotion.synthesis,
      sectionIndex: keyNotion.section,
      readingNotionIds,
    };
  });
  const missing = uncoveredSections(raw.sections.length, keyNotions);
  if (missing.length > 0) problems.push(`ces parties n'ont aucune notion clé : ${missing.map((index) => `« ${raw.sections[index] ?? ""} »`).join(", ")}`);
  if (problems.length > 0) throw new Error(problems.join(" ; "));
  return { sections: raw.sections, keyNotions };
}

// Never called by pnpm test: this is the real adapter, exercised only by
// pnpm eval (manual, costs money) and in production (CLAUDE.md rule 3).
export class ClaudeKeyNotionExtractor implements KeyNotionExtractor {
  constructor(private readonly model: LanguageModel) {}

  async extract(input: KeyNotionExtractionInput): Promise<Result<KeyNotionExtraction, KeyNotionExtractionError>> {
    const prompt = promptFor(input);

    const attempt = async (extraContext?: string): Promise<KeyNotionExtraction> => {
      let generated;
      try {
        generated = await generateObject({
          model: this.model,
          experimental_repairText: ({ text }) => Promise.resolve(unwrapStringifiedJson(text)),
          schema: extractionSchema,
          prompt: extraContext ? `${prompt}\n\n${extraContext}` : prompt,
          maxTokens: KEY_NOTION_EXTRACTOR_MAX_TOKENS,
        });
      } catch (error) {
        if (NoObjectGeneratedError.isInstance(error) && error.finishReason === "length") throw new TruncatedOutputError();
        throw error;
      }
      if (generated.finishReason === "length") throw new TruncatedOutputError();
      return resolve(generated.object, input);
    };
    const truncated = (): Result<KeyNotionExtraction, KeyNotionExtractionError> =>
      err({
        kind: "truncated",
        message: `Model output truncated at the ${String(KEY_NOTION_EXTRACTOR_MAX_TOKENS)}-token limit while extracting key notions from a ${String(input.markdown.length)}-character course`,
      });

    let first: KeyNotionExtraction;
    try {
      first = await attempt();
    } catch (firstError) {
      if (firstError instanceof TruncatedOutputError) return truncated();
      try {
        return ok(await attempt(`Ta réponse précédente n'a pas respecté le format attendu : ${describeError(firstError)}. Corrige et réessaie.`));
      } catch (secondError) {
        if (secondError instanceof TruncatedOutputError) return truncated();
        return err({ kind: "model-error", message: describeError(secondError) });
      }
    }

    // Below the budget's minimum: asked once more, naming the shortfall
    // (decisions D17: the prompt alone left a 5-page course at 15 for a
    // minimum of 16). Not a validation failure: if the second answer is
    // still short, or invalid, the fuller valid answer is kept.
    const { min } = input.budget.keyNotions;
    if (first.keyNotions.length >= min || first.keyNotions.length === 0) return ok(first);
    try {
      const second = await attempt(
        `Ta réponse précédente ne contient que ${String(first.keyNotions.length)} notions clés : il en faut au moins ${String(min)} notions clés. Relis le cours et complète, sans doublon.`,
      );
      return ok(second.keyNotions.length > first.keyNotions.length ? second : first);
    } catch {
      return ok(first);
    }
  }
}
