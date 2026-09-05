import type { Result } from "../../shared/index.js";
import type { Conversation, Message, Section } from "./types.js";

export type ExtractError = { kind: "invalid-output"; message: string };

export interface ChatModel {
  stream(input: {
    question: string;
    sections: Section[];
    history: { role: "user" | "assistant"; content: string }[];
  }): AsyncIterable<string>;
}

export interface CitationExtractor {
  extract(input: { answer: string; sections: Section[] }): Promise<Result<{ sectionIndexes: number[] }, ExtractError>>;
}

// Not in docs/modules/tutor.md's original Ports list (only the two
// model-facing ports were), but required by its own Use cases list, same
// reasoning as content's NotionRepository. Every method takes userId and
// filters on it.
export interface ConversationRepository {
  createConversation(userId: string, documentId: string, conversation: Conversation): Promise<void>;
  listConversations(userId: string, documentId: string): Promise<Conversation[]>;
  findConversation(userId: string, conversationId: string): Promise<Conversation | null>;
  deleteConversation(userId: string, conversationId: string): Promise<void>;
  listMessages(userId: string, conversationId: string): Promise<Message[]>;
  // Both messages of one exchange, written together: appendMessage
  // (singular) would open two short transactions instead of one, making it
  // possible to persist a student's question with no answer if the process
  // died between the two writes (docs/modules/tutor.md).
  appendMessages(userId: string, conversationId: string, messages: Message[]): Promise<void>;
  // A separate, later, equally short write, not folded into appendMessages:
  // titling happens at most once and is unrelated to the exchange itself.
  setConversationTitle(userId: string, conversationId: string, title: string): Promise<void>;
}
