import { describe, expect, it } from "vitest";
import type { Document } from "../../ingestion/index.js";
import { ok } from "../../shared/index.js";
import { splitIntoSections } from "../domain/split-into-sections.js";
import type { CitationExtractor } from "../domain/ports.js";
import type { Answer, Conversation, Section } from "../domain/types.js";
import { FixtureChatModel } from "../infra/fixture-chat-model.js";
import { FixtureCitationExtractor } from "../infra/fixture-citation-extractor.js";
import { ask, type AskDeps } from "./ask.js";
import { fakeConversationRepository, fakeDocumentRepositoryForTutor, fakeJobQueueForTutor } from "./fakes.js";

const now = new Date("2026-01-01T00:00:00.000Z");

// Two real paragraphs, each over the 80-character merge threshold, so
// splitIntoSections yields exactly two sections: the title merges forward
// into the first. FixtureCitationExtractor("valid") cites indexes [0, 1],
// so both must resolve to real section text, never an out-of-range slice.
const MARKDOWN =
  "# Titre\n\n" +
  "Un premier paragraphe de cours assez long pour dépasser le seuil de quatre-vingts caractères sans aucun souci ici.\n\n" +
  "Un second paragraphe de cours, également assez long pour dépasser ce même seuil sans aucun problème non plus.";

function aDocument(overrides: Partial<Document> = {}): Document {
  return {
    id: "doc-1",
    userId: "u1",
    title: "Cours",
    sourceType: "pdf",
    status: "done",
    pageCount: 1,
    colour: "#F87171",
    createdAt: now.toISOString(),
    ...overrides,
  };
}

function aConversation(overrides: Partial<Conversation> = {}): Conversation {
  return { id: "c1", userId: "u1", documentId: "doc-1", title: null, createdAt: now.toISOString(), ...overrides };
}

function baseDeps(overrides: Partial<AskDeps> = {}): AskDeps {
  let counter = 0;
  return {
    documentRepo: fakeDocumentRepositoryForTutor({
      documents: [aDocument()],
      extractions: [{ documentId: "doc-1", markdown: MARKDOWN, extractedAt: now.toISOString() }],
    }),
    jobQueue: fakeJobQueueForTutor(),
    conversationRepo: fakeConversationRepository({ conversations: [aConversation()] }),
    chatModel: new FixtureChatModel("valid"),
    citationExtractor: new FixtureCitationExtractor("valid"),
    idGenerator: { next: () => `m${String((counter += 1))}` },
    ...overrides,
  };
}

async function drain(session: AsyncGenerator<string, Answer, void>): Promise<{ chunks: string[]; answer: Answer }> {
  const chunks: string[] = [];
  let result = await session.next();
  while (!result.done) {
    chunks.push(result.value);
    result = await session.next();
  }
  return { chunks, answer: result.value };
}

function countingCitationExtractor(): CitationExtractor & { calls: number } {
  let calls = 0;
  return {
    calls: 0,
    extract() {
      calls += 1;
      this.calls = calls;
      return Promise.resolve(ok({ sectionIndexes: [0] }));
    },
  };
}

describe("ask", () => {
  it("never reads a document the caller does not own, even one their own conversation points to, not a leaked answer", async () => {
    // u1 owns the conversation, but the document it points to is bob's --
    // documentId is read from the conversation, never taken from the
    // caller, so there is no separate argument to attack here either.
    const deps = baseDeps({
      documentRepo: fakeDocumentRepositoryForTutor({
        documents: [aDocument({ userId: "bob" })],
        extractions: [{ documentId: "doc-1", markdown: MARKDOWN, extractedAt: now.toISOString() }],
      }),
    });

    const result = await ask(deps, "u1", "Une question ?", "c1", now);

    expect(result).toEqual({ ok: false, error: "document-not-found" });
  });

  it("never reads another user's conversation, even with the caller's own valid document", async () => {
    const deps = baseDeps({
      conversationRepo: fakeConversationRepository({ conversations: [aConversation({ userId: "bob" })] }),
    });

    const result = await ask(deps, "u1", "Une question ?", "c1", now);

    expect(result).toEqual({ ok: false, error: "conversation-not-found" });
  });

  it("a stream cut mid-way yields a partial Answer, persists partial:true with no citations, and never calls CitationExtractor", async () => {
    const extractor = countingCitationExtractor();
    const deps = baseDeps({ chatModel: new FixtureChatModel("mid-stream-failure"), citationExtractor: extractor });

    const result = await ask(deps, "u1", "Une question ?", "c1", now);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const { answer } = await drain(result.value);

    expect(answer.kind).toBe("partial");
    expect(extractor.calls).toBe(0);

    const conversationRepo = deps.conversationRepo as ReturnType<typeof fakeConversationRepository>;
    const assistantMessage = conversationRepo.messages.find((m) => m.role === "assistant");
    expect(assistantMessage?.partial).toBe(true);
    expect(assistantMessage?.citations).toBeNull();
  });

  it("a complete, grounded answer persists both messages with real section text as citations", async () => {
    const deps = baseDeps();

    const result = await ask(deps, "u1", "Une question ?", "c1", now);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const { chunks, answer } = await drain(result.value);

    expect(chunks.length).toBeGreaterThan(1);
    expect(answer.kind).toBe("complete");
    if (answer.kind !== "complete") return;
    expect(answer.grounded).toBe(true);
    const expectedSections = splitIntoSections(MARKDOWN);
    expect(answer.citations).toEqual(expectedSections.map((text) => ({ text })));

    const conversationRepo = deps.conversationRepo as ReturnType<typeof fakeConversationRepository>;
    expect(conversationRepo.messages).toHaveLength(2);
    expect(conversationRepo.messages[0]).toMatchObject({ role: "user", content: "Une question ?", partial: false });
    expect(conversationRepo.messages[1]).toMatchObject({ role: "assistant", partial: false });
  });

  it("a complete answer with no supporting section is grounded:false, not partial", async () => {
    const deps = baseDeps({ citationExtractor: new FixtureCitationExtractor("empty") });

    const result = await ask(deps, "u1", "Une question ?", "c1", now);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const { answer } = await drain(result.value);

    expect(answer).toEqual({ kind: "complete", text: expect.any(String) as string, citations: [], grounded: false });
  });

  it("refuses when the document is not ready yet", async () => {
    const deps = baseDeps({
      documentRepo: fakeDocumentRepositoryForTutor({
        documents: [aDocument({ status: "running" })],
        extractions: [],
      }),
    });

    const result = await ask(deps, "u1", "Une question ?", "c1", now);

    expect(result).toEqual({ ok: false, error: "document-not-ready" });
  });

  it("sets the conversation's title from the first question, truncated, only once", async () => {
    const conversationRepo = fakeConversationRepository({ conversations: [aConversation({ title: null })] });
    const deps = baseDeps({ conversationRepo });
    const firstQuestion = "Explique-moi la dérivée en un point précis, stp";

    const firstResult = await ask(deps, "u1", firstQuestion, "c1", now);
    if (!firstResult.ok) throw new Error("expected ok");
    await drain(firstResult.value);
    expect(conversationRepo.conversations[0]?.title).toBe(firstQuestion);

    const secondResult = await ask(deps, "u1", "Et la seconde question ?", "c1", now);
    if (!secondResult.ok) throw new Error("expected ok");
    await drain(secondResult.value);

    expect(conversationRepo.conversations[0]?.title).toBe(firstQuestion);
  });

  it("sends the split sections and prior history to ChatModel", async () => {
    let receivedSections: Section[] = [];
    let receivedHistory: { role: "user" | "assistant"; content: string }[] = [];
    const chatModel = {
      async *stream(input: { question: string; sections: Section[]; history: { role: "user" | "assistant"; content: string }[] }) {
        await Promise.resolve();
        receivedSections = input.sections;
        receivedHistory = input.history;
        yield "Réponse.";
      },
    };
    const conversationRepo = fakeConversationRepository({
      conversations: [aConversation()],
      messages: [
        { id: "m0", conversationId: "c1", role: "user", content: "Première question", citations: null, partial: false, createdAt: now.toISOString() },
        { id: "m0b", conversationId: "c1", role: "assistant", content: "Première réponse", citations: [], partial: false, createdAt: now.toISOString() },
      ],
    });
    const deps = baseDeps({ chatModel, conversationRepo });

    const result = await ask(deps, "u1", "Deuxième question", "c1", now);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    await drain(result.value);

    expect(receivedSections.length).toBe(2);
    expect(receivedSections[0]?.text).toContain("Titre");
    expect(receivedHistory).toEqual([
      { role: "user", content: "Première question" },
      { role: "assistant", content: "Première réponse" },
    ]);
  });
});
