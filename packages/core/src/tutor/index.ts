export type { Answer, Citation, Conversation, Message, Section } from "./domain/types.js";
export type { ChatModel, CitationExtractor, ConversationRepository, ExtractError } from "./domain/ports.js";

export { ask, type AskDeps, type AskError, type AskSession } from "./application/ask.js";
export { createConversation, type CreateConversationDeps } from "./application/create-conversation.js";
export { listConversations, type ListConversationsDeps } from "./application/list-conversations.js";
export { getConversation, type GetConversationDeps, type ConversationDetail } from "./application/get-conversation.js";
export { deleteConversation, type DeleteConversationDeps } from "./application/delete-conversation.js";

export { FixtureChatModel, type ChatFixtureCase } from "./infra/fixture-chat-model.js";
export { FixtureCitationExtractor, type ExtractFixtureCase } from "./infra/fixture-citation-extractor.js";
