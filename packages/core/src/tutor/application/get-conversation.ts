import type { ConversationRepository } from "../domain/ports.js";
import type { Conversation, Message } from "../domain/types.js";

export interface GetConversationDeps {
  conversationRepo: ConversationRepository;
}

export type ConversationDetail = { conversation: Conversation; messages: Message[] };

export async function getConversation(deps: GetConversationDeps, userId: string, conversationId: string): Promise<ConversationDetail | null> {
  const conversation = await deps.conversationRepo.findConversation(userId, conversationId);
  if (!conversation) return null;

  const messages = await deps.conversationRepo.listMessages(userId, conversationId);
  return { conversation, messages };
}
