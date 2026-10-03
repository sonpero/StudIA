import { generateObject, NoObjectGeneratedError, type LanguageModel } from "ai";
import { z } from "zod";
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
  summary: z.string().describe("Ce qu'il faut retenir, en une ou deux phrases, 200 caractères au plus."),
  readingNotions: z
    .array(z.string())
    .describe("Références (L1, L2…) des notions de lecture qui contiennent la matière de cette notion clé. Au moins une."),
});

const extractionSchema = z.object({
  sections: z.array(z.string()).describe("Les grandes parties du cours, dans l'ordre, avec leur titre tel qu'il apparaît dans le cours."),
  keyNotions: z.array(keyNotionSchema).describe("Les notions clés du cours, dans l'ordre du cours."),
});

// Output budget. The largest budget asks for 90 key notions; each one is a
// title, a summary of at most 200 characters and a few references, ~100
// output tokens with the JSON keys, so ~9 000 tokens, plus the sections.
// 16 000 leaves ~1.7x headroom and stays at the comfortable ceiling of a
// non-streamed call (same reasoning as content's SPLITTER_MAX_TOKENS).
export const KEY_NOTION_EXTRACTOR_MAX_TOKENS = 16_000;

// Never more sections than the fewest key notions allowed, so every section
// can get one; and a dozen-odd at most, the scale of a course's chapters.
const MAX_SECTIONS = 15;

class TruncatedOutputError extends Error {}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

const PROMPT_PREFIX =
  "Tu reçois un cours complet et la liste de ses notions de lecture. Identifie ses notions clés : " +
  "ce qu'un élève doit savoir et pouvoir restituer après avoir étudié ce cours. Chaque notion clé " +
  "porte sur une seule idée, et deux notions clés n'interrogent jamais la même chose. Ne retiens " +
  "aucune notion secondaire (anecdote, détail d'illustration, exemple isolé).";

function promptFor(input: KeyNotionExtractionInput): string {
  const { keyNotions, mcq, open } = input.budget;
  const maxSections = Math.min(keyNotions.min, MAX_SECTIONS);
  const notionList = input.readingNotions.map((notion, index) => `L${String(index + 1)} — ${notion.title}`).join("\n");
  return [
    PROMPT_PREFIX,
    `Produis entre ${String(keyNotions.min)} et ${String(keyNotions.max)} notions clés : vise le bas de la fourchette pour un cours peu dense ou répétitif, le haut pour un cours dense.`,
    `Parmi elles, entre ${String(mcq.min)} et ${String(mcq.max)} sont essentielles (importance « essential »), les autres importantes.`,
    `Entre ${String(open.min)} et ${String(open.max)} sont des notions de synthèse (synthesis à true).`,
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

    try {
      return ok(await attempt());
    } catch (firstError) {
      if (firstError instanceof TruncatedOutputError) return truncated();
      try {
        return ok(await attempt(`Ta réponse précédente n'a pas respecté le format attendu : ${describeError(firstError)}. Corrige et réessaie.`));
      } catch (secondError) {
        if (secondError instanceof TruncatedOutputError) return truncated();
        return err({ kind: "model-error", message: describeError(secondError) });
      }
    }
  }
}
