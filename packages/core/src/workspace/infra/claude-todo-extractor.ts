import { generateObject, type LanguageModel } from "ai";
import { z } from "zod";
import { err, ok, type Result } from "../../shared/index.js";
import type { TodoExtractionError, TodoExtractionOutput, TodoExtractor } from "../domain/ports.js";

const extractedTodoSchema = z.object({
  label: z.string().describe("The homework or task description, exactly as written on the photo."),
  dueDate: z.string().describe("The due date resolved to an ISO date (YYYY-MM-DD) from the photo's own date or weekday context, or null if none is given.").nullable(),
  subject: z.string().describe("The school subject this task belongs to, if identifiable from the photo, else null.").nullable(),
});

const todoExtractionOutputSchema = z
  .object({
    todos: z.array(extractedTodoSchema).describe("Every homework or task visible on the photo."),
    legible: z.boolean().describe("False if the photo is too blurry, dark, or cropped to read reliably."),
    reason: z.string().optional().describe("When legible is false, a short reason to show the student, e.g. 'trop flou'."),
  })
  .refine(
    (output) => new Set(output.todos.map((t) => `${t.label}|${t.dueDate ?? ""}`)).size === output.todos.length,
    "the same task (same label and due date) is listed more than once",
  );

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

const PROMPT = (today: string) =>
  `Voici une photo d'agenda ou de planning scolaire. Aujourd'hui, nous sommes le ${today}. ` +
  "Liste chaque devoir ou tâche visible avec son intitulé, sa date d'échéance résolue en ISO (YYYY-MM-DD) " +
  "à partir du jour de la semaine ou de la date indiquée sur la photo, et la matière si elle est identifiable. " +
  "Mets dueDate à null si aucune échéance n'est indiquée. " +
  "Si la photo est trop floue, trop sombre ou coupée pour être lue de façon fiable, indique legible=false et donne une raison brève.";

// Never called by pnpm test: exercised only by pnpm fixtures:record and in
// production (CLAUDE.md rule 3). Same shape as ingestion.VisionExtractor —
// this module's own Ports section explains why it isn't a reuse of that
// file (docs/modules/workspace.md).
export class ClaudeTodoExtractor implements TodoExtractor {
  constructor(private readonly model: LanguageModel) {}

  async extract(input: { bytes: Buffer; today: string }): Promise<Result<TodoExtractionOutput, TodoExtractionError>> {
    const attempt = (extraContext?: string) =>
      generateObject({
        model: this.model,
        schema: todoExtractionOutputSchema,
        messages: [
          {
            role: "user",
            content: [
              { type: "image", image: input.bytes },
              { type: "text", text: extraContext ? `${PROMPT(input.today)}\n\n${extraContext}` : PROMPT(input.today) },
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
