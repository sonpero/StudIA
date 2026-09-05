import { generateObject, type LanguageModel } from "ai";
import { z } from "zod";
import { err, ok, type Result } from "../../shared/index.js";
import type { CitationExtractor, ExtractError } from "../domain/ports.js";
import type { Section } from "../domain/types.js";

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// A duplicate index is a domain invariant no single-field Zod bound can
// express (each index is independently valid, [0.min(0), sections.length-1])
// -- checked by hand after generateObject returns and funnelled into the
// same retry-once-then-fail path as a structural schema violation, same
// reasoning as content's assertDistinctTitles.
function assertDistinctIndexes(sectionIndexes: number[]): void {
  if (new Set(sectionIndexes).size !== sectionIndexes.length) {
    throw new Error("sectionIndexes must not repeat the same section twice");
  }
}

const PROMPT_PREFIX =
  "Voici une réponse donnée à un élève, et les sections du cours qui lui ont été fournies pour y répondre. " +
  "Indique les numéros des sections qui soutiennent réellement cette réponse — seulement celles dont le contenu " +
  "est effectivement utilisé pour répondre à la question posée, jamais une section au hasard. Si la réponse " +
  "indique que le cours n'aborde pas le sujet demandé (un refus), renvoie toujours une liste vide, même si le " +
  "refus mentionne en passant le vrai sujet du cours : mentionner de quoi parle le cours n'est pas s'appuyer " +
  "dessus pour répondre. S'il n'y a aucune section réellement utilisée, renvoie une liste vide.";

function sectionsBlock(sections: Section[]): string {
  return sections.map((section) => `[${section.index}] ${section.text}`).join("\n\n");
}

// Never called by pnpm test: this is the real adapter, exercised only by
// pnpm eval (manual, costs money) and in production (CLAUDE.md rule 3).
export class ClaudeCitationExtractor implements CitationExtractor {
  constructor(private readonly model: LanguageModel) {}

  async extract(input: { answer: string; sections: Section[] }): Promise<Result<{ sectionIndexes: number[] }, ExtractError>> {
    // Built per call: the upper bound is a function of this call's own
    // section count, not a fixed constant (docs/modules/tutor.md's Ports
    // section). ask() only calls this once sections is non-empty (a blank
    // document already fails as document-not-ready), so maxIndex is always
    // >= 0 here.
    const maxIndex = input.sections.length - 1;
    const schema = z.object({
      sectionIndexes: z
        .array(z.number().int().min(0).max(maxIndex))
        .describe("Indices (0-based) of the sections that actually support the answer. Empty if none do."),
    });

    const prompt = `${PROMPT_PREFIX}\n\nRéponse donnée à l'élève :\n${input.answer}\n\nSections du cours :\n${sectionsBlock(input.sections)}`;

    const attempt = async (extraContext?: string) => {
      const { object } = await generateObject({
        model: this.model,
        schema,
        prompt: extraContext ? `${prompt}\n\n${extraContext}` : prompt,
      });
      assertDistinctIndexes(object.sectionIndexes);
      return object;
    };

    try {
      return ok(await attempt());
    } catch (firstError) {
      // Retry once with the validation error fed back to the model, then
      // fail (CLAUDE.md rule 4).
      try {
        return ok(await attempt(`Ta réponse précédente n'a pas respecté le format attendu : ${describeError(firstError)}. Corrige et réessaie.`));
      } catch (secondError) {
        return err({ kind: "invalid-output", message: describeError(secondError) });
      }
    }
  }
}
