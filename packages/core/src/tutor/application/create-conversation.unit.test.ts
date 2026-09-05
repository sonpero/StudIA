import { describe, expect, it } from "vitest";
import type { Document } from "../../ingestion/index.js";
import { createConversation } from "./create-conversation.js";
import { fakeConversationRepository, fakeDocumentRepositoryForTutor } from "./fakes.js";

const now = new Date("2026-01-01T00:00:00.000Z");

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

describe("createConversation", () => {
  it("creates a conversation with no title yet, scoped to the caller and the document", async () => {
    const documentRepo = fakeDocumentRepositoryForTutor({ documents: [aDocument()] });
    const conversationRepo = fakeConversationRepository();

    const result = await createConversation({ documentRepo, conversationRepo, idGenerator: { next: () => "c1" } }, "u1", "doc-1", now);

    expect(result).toEqual({ ok: true, value: { id: "c1", userId: "u1", documentId: "doc-1", title: null, createdAt: now.toISOString() } });
    expect(conversationRepo.conversations).toHaveLength(1);
  });

  it("refuses a document that does not belong to the caller, without creating anything", async () => {
    const documentRepo = fakeDocumentRepositoryForTutor({ documents: [aDocument({ userId: "u2" })] });
    const conversationRepo = fakeConversationRepository();

    const result = await createConversation({ documentRepo, conversationRepo, idGenerator: { next: () => "c1" } }, "u1", "doc-1", now);

    expect(result).toEqual({ ok: false, error: "not-found" });
    expect(conversationRepo.conversations).toHaveLength(0);
  });
});
