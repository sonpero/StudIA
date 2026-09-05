import type { DocumentRepository } from "../../ingestion/index.js";
import { err, ok, type IdGenerator, type Result } from "../../shared/index.js";
import type { ConversationRepository } from "../domain/ports.js";
import type { Conversation } from "../domain/types.js";

export interface CreateConversationDeps {
  documentRepo: DocumentRepository;
  conversationRepo: ConversationRepository;
  idGenerator: IdGenerator;
}

// A direct DocumentRepository check, not the full ingestion.getDocument:
// an empty conversation shell does not need extraction to be finished, only
// ask() does (docs/modules/tutor.md).
export async function createConversation(
  deps: CreateConversationDeps,
  userId: string,
  documentId: string,
  now: Date,
): Promise<Result<Conversation, "not-found">> {
  const document = await deps.documentRepo.findDocument(userId, documentId);
  if (!document) return err("not-found");

  const conversation: Conversation = {
    id: deps.idGenerator.next(),
    userId,
    documentId,
    title: null,
    createdAt: now.toISOString(),
  };
  await deps.conversationRepo.createConversation(userId, documentId, conversation);
  return ok(conversation);
}
