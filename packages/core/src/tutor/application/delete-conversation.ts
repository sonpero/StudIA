import type { ConversationRepository } from "../domain/ports.js";

export interface DeleteConversationDeps {
  conversationRepo: ConversationRepository;
}

export function deleteConversation(deps: DeleteConversationDeps, userId: string, conversationId: string): Promise<void> {
  return deps.conversationRepo.deleteConversation(userId, conversationId);
}
