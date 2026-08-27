import { generateObject, type LanguageModel } from "ai";
import { z } from "zod";
import { err, ok, type Result } from "../../shared/index.js";
import { hasDuplicateTitles } from "../domain/has-duplicate-titles.js";
import type { NotionSplitter, SplitError } from "../domain/ports.js";
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

  async split(input: { markdown: string; hint?: { subject?: string; level?: string } }): Promise<Result<SplitNotion[], SplitError>> {
    const hintLine = input.hint
      ? `\n\nContexte : ${[input.hint.subject, input.hint.level].filter(Boolean).join(", ")}.`
      : "";
    const prompt = `${PROMPT_PREFIX}${hintLine}\n\n---\n\n${input.markdown}`;

    const attempt = async (extraContext?: string) => {
      const { object } = await generateObject({
        model: this.model,
        output: "array",
        schema: splitNotionSchema,
        prompt: extraContext ? `${prompt}\n\n${extraContext}` : prompt,
      });
      assertDistinctTitles(object);
      return object;
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
