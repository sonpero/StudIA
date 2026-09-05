import { err, ok, type Result } from "../../shared/index.js";
import type { ConversationRepository } from "../domain/ports.js";

export interface DeleteConversationDeps {
  conversationRepo: ConversationRepository;
}

export async function deleteConversation(deps: DeleteConversationDeps, userId: string, conversationId: string): Promise<Result<void, "not-found">> {
  const deleted = await deps.conversationRepo.deleteConversation(userId, conversationId);
  if (!deleted) return err("not-found");
  return ok(undefined);
}
