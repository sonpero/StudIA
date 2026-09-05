import { getDocument, type DocumentRepository } from "../../ingestion/index.js";
import type { JobQueue } from "../../jobs/index.js";
import { err, ok, type IdGenerator, type Result } from "../../shared/index.js";
import type { ChatModel, CitationExtractor, ConversationRepository } from "../domain/ports.js";
import { splitIntoSections } from "../domain/split-into-sections.js";
import { truncateTitle } from "../domain/truncate-title.js";
import type { Answer, Citation, Message, Section } from "../domain/types.js";

export interface AskDeps {
  documentRepo: DocumentRepository;
  jobQueue: JobQueue;
  conversationRepo: ConversationRepository;
  chatModel: ChatModel;
  citationExtractor: CitationExtractor;
  idGenerator: IdGenerator;
}

export type AskError = "document-not-found" | "document-not-ready" | "conversation-not-found";

// The caller (the SSE route) iterates this for each streamed chunk; its
// final value, once iteration ends, is the persisted Answer.
export type AskSession = AsyncGenerator<string, Answer, void>;

// Resolves fast on pre-flight checks only; a stream that starts and then
// fails is not a pre-flight error, it is the 'partial' branch of Answer,
// produced from inside the returned session (docs/modules/tutor.md).
export async function ask(
  deps: AskDeps,
  userId: string,
  documentId: string,
  question: string,
  conversationId: string,
  now: Date,
): Promise<Result<AskSession, AskError>> {
  const document = await getDocument({ repo: deps.documentRepo, jobQueue: deps.jobQueue }, userId, documentId);
  if (!document.ok) return err("document-not-found");
  if (document.value.status !== "done" || document.value.markdown === null) return err("document-not-ready");

  const conversation = await deps.conversationRepo.findConversation(userId, conversationId);
  if (!conversation) return err("conversation-not-found");

  const history = await deps.conversationRepo.listMessages(userId, conversationId);
  const sections: Section[] = splitIntoSections(document.value.markdown).map((text, index) => ({ index, text }));

  return ok(streamAnswer(deps, userId, conversationId, question, sections, history, now));
}

async function* streamAnswer(
  deps: AskDeps,
  userId: string,
  conversationId: string,
  question: string,
  sections: Section[],
  history: Message[],
  now: Date,
): AskSession {
  const historyInput = history.map((m) => ({ role: m.role, content: m.content }));

  let text = "";
  let partial = false;
  try {
    for await (const chunk of deps.chatModel.stream({ question, sections, history: historyInput })) {
      text += chunk;
      yield chunk;
    }
  } catch {
    partial = true;
  }

  const answer: Answer = partial ? { kind: "partial", text } : await buildCompleteAnswer(deps, text, sections);

  const nowIso = now.toISOString();
  const userMessage: Message = {
    id: deps.idGenerator.next(),
    conversationId,
    role: "user",
    content: question,
    citations: null,
    partial: false,
    createdAt: nowIso,
  };
  const assistantMessage: Message = {
    id: deps.idGenerator.next(),
    conversationId,
    role: "assistant",
    content: answer.text,
    citations: answer.kind === "complete" ? answer.citations : null,
    partial: answer.kind === "partial",
    createdAt: nowIso,
  };
  await deps.conversationRepo.appendMessages(userId, conversationId, [userMessage, assistantMessage]);

  if (history.length === 0) {
    await deps.conversationRepo.setConversationTitle(userId, conversationId, truncateTitle(question));
  }

  return answer;
}

async function buildCompleteAnswer(deps: AskDeps, text: string, sections: Section[]): Promise<Answer> {
  const extracted = await deps.citationExtractor.extract({ answer: text, sections });
  const citations: Citation[] = extracted.ok
    ? extracted.value.sectionIndexes
        .map((index) => sections[index])
        .filter((section): section is Section => section !== undefined)
        .map((section) => ({ text: section.text }))
    : [];
  return { kind: "complete", text, citations, grounded: citations.length > 0 };
}
