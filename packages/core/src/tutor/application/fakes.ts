// In-memory test doubles for tutor's ports (CLAUDE.md rule 3: every port
// gets a real adapter and a fixture/fake used in tests; no test hits the
// network or the filesystem through these). ChatModel and CitationExtractor
// already have their own fixture adapters (infra/fixture-chat-model.ts,
// infra/fixture-citation-extractor.ts, TESTING.md's "port level" fixtures);
// only ConversationRepository, and local stand-ins for the two other
// modules' ports ask() reads through, live here.
import type { Document, DocumentRepository, Extraction } from "../../ingestion/index.js";
import type { JobQueue } from "../../jobs/index.js";
import type { ConversationRepository } from "../domain/ports.js";
import type { Conversation, Message } from "../domain/types.js";

export function fakeConversationRepository(
  seed: { conversations?: Conversation[]; messages?: Message[] } = {},
): ConversationRepository & { conversations: Conversation[]; messages: Message[] } {
  const conversations = [...(seed.conversations ?? [])];
  const messages = [...(seed.messages ?? [])];
  const own = (userId: string, conversationId: string) => conversations.find((c) => c.id === conversationId && c.userId === userId);

  return {
    conversations,
    messages,
    createConversation: (_userId, _documentId, conversation) => {
      conversations.push(conversation);
      return Promise.resolve();
    },
    listConversations: (userId, documentId) =>
      Promise.resolve(conversations.filter((c) => c.userId === userId && c.documentId === documentId)),
    findConversation: (userId, conversationId) => Promise.resolve(own(userId, conversationId) ?? null),
    deleteConversation: (userId, conversationId) => {
      const index = conversations.findIndex((c) => c.id === conversationId && c.userId === userId);
      if (index !== -1) conversations.splice(index, 1);
      return Promise.resolve();
    },
    listMessages: (userId, conversationId) => {
      if (!own(userId, conversationId)) return Promise.resolve([]);
      return Promise.resolve(messages.filter((m) => m.conversationId === conversationId));
    },
    appendMessages: (userId, conversationId, newMessages) => {
      if (!own(userId, conversationId)) return Promise.resolve();
      messages.push(...newMessages);
      return Promise.resolve();
    },
    setConversationTitle: (userId, conversationId, title) => {
      const conversation = own(userId, conversationId);
      if (conversation) conversation.title = title;
      return Promise.resolve();
    },
  };
}

// Minimal local stand-in for ingestion's DocumentRepository -- not a deep
// import of ingestion's own internal fakes.ts (not part of ingestion/
// index.ts's public surface), same reasoning as content's
// fakeDocumentRepositoryForContent. ask() reads findDocument and
// getExtraction only (via ingestion.getDocument); every other method throws
// if ever called by mistake. getExtraction matches by documentId alone --
// Extraction itself carries no userId (docs/modules/ingestion.md: ownership
// is enforced by the join through documents in the real query) -- so seed
// data must only pair an extraction with a document that already belongs to
// the right user.
export function fakeDocumentRepositoryForTutor(seed: { documents?: Document[]; extractions?: Extraction[] } = {}): DocumentRepository {
  const documents = seed.documents ?? [];
  const extractions = seed.extractions ?? [];
  const notImplemented = (method: string) => () => {
    throw new Error(`fakeDocumentRepositoryForTutor: ${method} is not implemented, tutor does not call it`);
  };

  return {
    createDocument: notImplemented("createDocument"),
    countDocuments: notImplemented("countDocuments"),
    findDocument: (userId, documentId) => Promise.resolve(documents.find((d) => d.id === documentId && d.userId === userId) ?? null),
    listDocuments: notImplemented("listDocuments"),
    addPage: notImplemented("addPage"),
    listPages: notImplemented("listPages"),
    findPageBySha256: notImplemented("findPageBySha256"),
    getPage: notImplemented("getPage"),
    upsertExtraction: notImplemented("upsertExtraction"),
    getExtraction: (_userId, documentId) => Promise.resolve(extractions.find((e) => e.documentId === documentId) ?? null),
    deleteDocument: notImplemented("deleteDocument"),
    listDistinctUserIds: notImplemented("listDistinctUserIds"),
  };
}

// ask() reaches getDocument's live-job-status overlay through this, but
// tutor's own tests control readiness via the fake Document's `status`
// directly (docs/modules/tutor.md: createConversation does not pay for the
// overlay, only ask does) -- so listJobs always reporting no matching job is
// sufficient; every other method throws if ever called by mistake.
export function fakeJobQueueForTutor(): JobQueue {
  const notImplemented = (method: string) => () => {
    throw new Error(`fakeJobQueueForTutor: ${method} is not implemented, tutor does not call it`);
  };
  return {
    enqueue: notImplemented("enqueue"),
    claimNext: notImplemented("claimNext"),
    complete: notImplemented("complete"),
    fail: notImplemented("fail"),
    recoverStale: notImplemented("recoverStale"),
    listJobs: () => Promise.resolve([]),
  };
}
