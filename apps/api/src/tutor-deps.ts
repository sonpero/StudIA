import {
  FixtureChatModel,
  FixtureCitationExtractor,
  SqliteConversationRepository,
  type ChatModel,
  type CitationExtractor,
  type ConversationRepository,
} from "@studia/core";
import type { Db } from "./db/connection.js";

export interface TutorDeps {
  conversationRepo: ConversationRepository;
  chatModel: ChatModel;
  citationExtractor: CitationExtractor;
}

// No llmAdapter branch yet, unlike buildContentDeps/buildReviewDeps: this
// module's real adapters (ClaudeChatModel, ClaudeCitationExtractor) do not
// exist until M8's next commit. Always fixtures until then -- including
// with LLM_ADAPTER=real, so a real deploy today still boots (buildApp
// constructs every module's deps eagerly at startup, not lazily per
// request; a throw here would take down the whole API process, not just
// this route). Once the real adapters exist, this function grows the same
// llmAdapter/anthropicApiKey options those two already take, no other
// shape change.
export function buildTutorDeps(db: Db): TutorDeps {
  return {
    conversationRepo: new SqliteConversationRepository(db),
    chatModel: new FixtureChatModel("valid"),
    citationExtractor: new FixtureCitationExtractor("valid"),
  };
}
