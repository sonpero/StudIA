export type { Answer, Citation, Conversation, Message, Section } from "./domain/types.js";
export type { ChatModel, CitationExtractor, ConversationRepository, ExtractError } from "./domain/ports.js";
// Exported for evals/run-tutor.eval.test.ts: it calls ClaudeChatModel and
// ClaudeCitationExtractor directly (same shape as the M3/M4 eval calling
// ClaudeNotionSplitter directly), which needs the same section-building
// step ask() uses internally, without pulling in a full AskDeps/database
// setup just to measure model behaviour. content's equivalent
// (chunkByTopLevelHeadings) stays internal because nothing outside content
// ever needs it; this one has an external, legitimate caller.
export { splitIntoSections } from "./domain/split-into-sections.js";

export { ask, type AskDeps, type AskError, type AskSession } from "./application/ask.js";
export { createConversation, type CreateConversationDeps } from "./application/create-conversation.js";
export { listConversations, type ListConversationsDeps } from "./application/list-conversations.js";
export { getConversation, type GetConversationDeps, type ConversationDetail } from "./application/get-conversation.js";
export { deleteConversation, type DeleteConversationDeps } from "./application/delete-conversation.js";

export { FixtureChatModel, type ChatFixtureCase } from "./infra/fixture-chat-model.js";
export { FixtureCitationExtractor, type ExtractFixtureCase } from "./infra/fixture-citation-extractor.js";
export { ClaudeChatModel } from "./infra/claude-chat-model.js";
export { ClaudeCitationExtractor } from "./infra/claude-citation-extractor.js";
export { SqliteConversationRepository, type TutorDb } from "./infra/sqlite-conversation-repository.js";
// For apps/api/drizzle.config.ts's glob (same reason as content/ingestion/identity/jobs).
export { conversationsTable, messagesTable } from "./infra/schema.js";
