import { streamText, type LanguageModel } from "ai";
import type { ChatModel } from "../domain/ports.js";
import type { Section } from "../domain/types.js";

// French, tutoiement, matching docs/UI.md's copy register: the model is
// talking directly to the student, not to a developer. The refusal
// instruction here is the entire mechanism (docs/modules/tutor.md: there is
// no retrieval threshold anymore) -- verified by eval, not by this adapter's
// own tests, since it is not deterministic.
const SYSTEM_PROMPT_PREFIX =
  "Tu es le tuteur d'un cours, pour un élève. Réponds uniquement à partir des sections du cours ci-dessous. " +
  "Si elles ne permettent pas de répondre à la question, dis-le clairement plutôt que d'utiliser tes connaissances " +
  "générales : par exemple « Ce cours n'aborde pas ce sujet. » N'invente rien qui ne soit pas dans les sections " +
  "fournies. Réponds en français, tutoiement, phrases courtes.";

function sectionsBlock(sections: Section[]): string {
  return sections.map((section) => `[${section.index}] ${section.text}`).join("\n\n");
}

// Never called by pnpm test: this is the real adapter, exercised only by
// pnpm eval (manual, costs money) and in production (CLAUDE.md rule 3).
export class ClaudeChatModel implements ChatModel {
  constructor(private readonly model: LanguageModel) {}

  stream(input: { question: string; sections: Section[]; history: { role: "user" | "assistant"; content: string }[] }): AsyncIterable<string> {
    const { textStream } = streamText({
      model: this.model,
      system: `${SYSTEM_PROMPT_PREFIX}\n\n${sectionsBlock(input.sections)}`,
      messages: [...input.history, { role: "user" as const, content: input.question }],
    });
    return textStream;
  }
}
