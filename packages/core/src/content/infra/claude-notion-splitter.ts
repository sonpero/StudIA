import { generateObject, NoObjectGeneratedError, type LanguageModel } from "ai";
import { z } from "zod";
import { err, ok, type Result } from "../../shared/index.js";
import { hasDuplicateTitles } from "../domain/has-duplicate-titles.js";
import type { NotionSplitter, SplitError, SplitInput } from "../domain/ports.js";
import type { SplitNotion } from "../domain/types.js";

// Flat, one array of three-field objects: no nesting, no unions (CLAUDE.md).
// .min()/.max() are not transmitted to the model (CLAUDE.md); the real
// constraints live in .describe().
const splitNotionSchema = z.object({
  title: z
    .string()
    .describe("A short noun phrase naming one atomic idea from the course, 3 to 80 characters. Not a question."),
  body: z
    .string()
    .describe(
      "Self-contained Markdown explaining this one idea. It must make sense read alone, out of order, because that is how it will be reviewed.",
    ),
  difficulty: z.enum(["easy", "medium", "hard"]).describe("How hard this idea is to memorise and recall."),
});

// Output budget per call. Without it, @ai-sdk/anthropic@1.2.12 sends
// max_tokens 4096, which a 45 000-character chunk blew through.
//
// Sized against content's chunking hard max (chunk-by-size.ts,
// DEFAULT_CHUNKING.maxChars = 15 000 characters):
// - input: French course text ran ~3.5 characters per token on the
//   Sonnet 4.5 tokenizer; claude-sonnet-5's produces ~30% more tokens for
//   the same text, so at a conservative 2.5 a 15 000-character chunk is
//   ~6 000 tokens.
// - output: each notion's body must be self-contained, so it restates
//   context the source only gives once; assume the bodies total up to 1.5x
//   the input, plus ~15% of JSON overhead (keys, escaped quotes and
//   newlines, titles, difficulty): 6 000 x 1.5 x 1.15 ≈ 10 400 tokens.
// - headroom: 16 000 is ~1.55x that, and far under claude-sonnet-5's 128K
//   output limit. Its thinking (adaptive when not configured) counts
//   against the same limit: the real run records output tokens per chunk.
//   Not higher: generateObject makes a non-streamed request, and ~16 000 is
//   the documented comfortable ceiling for a non-streamed call before HTTP
//   timeouts become a risk.
export const SPLITTER_MAX_TOKENS = 16_000;

class TruncatedOutputError extends Error {}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// hasDuplicateTitles' refine is enforced by hand here, not as a Zod
// `.refine()` on the schema: output: 'array' mode's schema describes one
// element, not the array (content.md: "Keep it flat"); the array-level
// invariant cannot attach to a per-element schema, so it is checked after
// generateObject returns and funnelled into the exact same
// retry-once-then-fail path as a schema violation (CLAUDE.md rule 4).
function assertDistinctTitles(notions: SplitNotion[]): void {
  if (hasDuplicateTitles(notions.map((n) => n.title))) {
    throw new Error("Notion titles must be distinct within this chunk of the course");
  }
}

const PROMPT_PREFIX =
  "Découpe ce cours en notions atomiques : des idées qui peuvent être apprises, " +
  "interrogées et planifiées indépendamment. Chaque notion doit avoir un titre court " +
  "(3 à 80 caractères, un groupe nominal, jamais une question) et un corps en Markdown " +
  "autonome, compréhensible seul, hors de son ordre d'origine. Attribue une difficulté " +
  "(easy, medium, hard) reflétant la difficulté à mémoriser cette idée.";

// Never called by pnpm test: this is the real adapter, exercised only by
// pnpm eval (manual, costs money) and in production (CLAUDE.md rule 3).
export class ClaudeNotionSplitter implements NotionSplitter {
  constructor(private readonly model: LanguageModel) {}

  async split(input: SplitInput): Promise<Result<SplitNotion[], SplitError>> {
    const hintLine = input.hint
      ? `\n\nContexte : ${[input.hint.subject, input.hint.level].filter(Boolean).join(", ")}.`
      : "";
    // This chunk is one part of a longer course: titles must stay unique
    // across the whole document, not just within this response.
    const avoidLine =
      input.avoidTitles && input.avoidTitles.length > 0
        ? `\n\nTitres déjà utilisés par d'autres parties du même cours (n'en réutilise aucun, choisis un titre plus précis si l'idée est proche) :\n${input.avoidTitles.map((t) => `- ${t}`).join("\n")}`
        : "";
    // Without a count to aim for, the model split A2A's ~7 300-character
    // chunks into ~35 sentence-sized notions each (notion-count-target.ts).
    const targetLine = input.targetNotions
      ? `\n\nVise entre ${String(input.targetNotions.min)} et ${String(input.targetNotions.max)} notions pour cette partie. Une notion regroupe une idée complète avec ses détails, exemples et nuances : ne fais pas une notion par phrase, par champ ou par ligne de tableau.`
      : "";
    // The chunk's share of the document's cap (notion-budget.ts): the one
    // line that keeps the chunks' sum under the cap the job validates.
    const budgetLine =
      input.maxNotions !== undefined
        ? `\n\nPour cette partie, ne produis jamais plus de ${String(input.maxNotions)} notions : le cours entier a une limite, partagée entre ses parties.`
        : "";
    const prompt = `${PROMPT_PREFIX}${hintLine}${avoidLine}${targetLine}${budgetLine}\n\n---\n\n${input.markdown}`;

    const attempt = async (extraContext?: string) => {
      let generated;
      try {
        generated = await generateObject({
          model: this.model,
          output: "array",
          schema: splitNotionSchema,
          prompt: extraContext ? `${prompt}\n\n${extraContext}` : prompt,
          maxTokens: SPLITTER_MAX_TOKENS,
        });
      } catch (error) {
        // A cut-off tool call surfaces as a parse or schema failure, but the
        // SDK keeps the provider's finish reason on the error: "length" is
        // Anthropic's stop_reason "max_tokens".
        if (NoObjectGeneratedError.isInstance(error) && error.finishReason === "length") throw new TruncatedOutputError();
        throw error;
      }
      // A list that happens to parse at the cut is still missing its tail.
      if (generated.finishReason === "length") throw new TruncatedOutputError();
      assertDistinctTitles(generated.object);
      return generated.object;
    };
    const truncated = (): Result<SplitNotion[], SplitError> =>
      err({
        kind: "truncated",
        message: `Model output truncated at the ${String(SPLITTER_MAX_TOKENS)}-token limit while splitting a ${String(input.markdown.length)}-character chunk; the same input would truncate again`,
      });

    try {
      return ok(await attempt());
    } catch (firstError) {
      // Retrying a truncation with feedback would only truncate again.
      if (firstError instanceof TruncatedOutputError) return truncated();
      // Retry once with the validation error fed back to the model, then
      // fail (CLAUDE.md rule 4).
      try {
        return ok(
          await attempt(`Ta réponse précédente n'a pas respecté le format attendu : ${describeError(firstError)}. Corrige et réessaie.`),
        );
      } catch (secondError) {
        if (secondError instanceof TruncatedOutputError) return truncated();
        return err({ kind: "model-error", message: describeError(secondError) });
      }
    }
  }
}
