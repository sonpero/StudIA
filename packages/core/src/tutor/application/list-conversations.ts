import type { ConversationRepository } from "../domain/ports.js";
import type { Conversation } from "../domain/types.js";

export interface ListConversationsDeps {
  conversationRepo: ConversationRepository;
}

export function listConversations(deps: ListConversationsDeps, userId: string, documentId: string): Promise<Conversation[]> {
  return deps.conversationRepo.listConversations(userId, documentId);
}
