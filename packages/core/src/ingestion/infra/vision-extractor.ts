import { generateObject, type LanguageModel } from "ai";
import { z } from "zod";
import { err, ok, type Result } from "../../shared/index.js";
import type { DocumentExtractor, ExtractionError, ExtractionOutput } from "../domain/ports.js";
import type { SourceType } from "../domain/types.js";

const visionOutputSchema = z.object({
  markdown: z.string().describe("The page's text transcribed as Markdown, preserving heading hierarchy (# / ##)."),
  legible: z.boolean().describe("False if the photo is too blurry, dark, or cropped to read reliably."),
  reason: z.string().optional().describe("When legible is false, a short reason to show the student, e.g. 'trop flou'."),
});

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

const PROMPT =
  "Transcris le texte de cette photo de page de cours en Markdown, en conservant la hiérarchie des titres. " +
  "Si la photo est trop floue, trop sombre ou coupée pour être lue de façon fiable, indique legible=false et donne une raison brève.";

// Never called by pnpm test: this is the real adapter, exercised only by
// pnpm fixtures:record (manual, costs money) and in production
// (CLAUDE.md rule 3 — every LLM call goes through a port, no test hits the
// network).
export class VisionExtractor implements DocumentExtractor {
  constructor(private readonly model: LanguageModel) {}

  supports(sourceType: SourceType): boolean {
    return sourceType === "photo";
  }

  async extract(input: { bytes: Buffer; sourceType: SourceType }): Promise<Result<ExtractionOutput, ExtractionError>> {
    const attempt = (extraContext?: string) =>
      generateObject({
        model: this.model,
        schema: visionOutputSchema,
        messages: [
          {
            role: "user",
            content: [
              { type: "image", image: input.bytes },
              { type: "text", text: extraContext ? `${PROMPT}\n\n${extraContext}` : PROMPT },
            ],
          },
        ],
      });

    try {
      const { object } = await attempt();
      return ok(object);
    } catch (firstError) {
      // Retry once with the validation error fed back to the model, then
      // fail (CLAUDE.md rule 4).
      try {
        const { object } = await attempt(`Ta réponse précédente n'a pas respecté le format attendu : ${describeError(firstError)}. Corrige et réessaie.`);
        return ok(object);
      } catch (secondError) {
        return err({ kind: "model-error", message: describeError(secondError) });
      }
    }
  }
}
