import {
  ClaudeChatModel,
  ClaudeCitationExtractor,
  FixtureChatModel,
  FixtureCitationExtractor,
  SqliteConversationRepository,
  createLanguageModel,
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

export interface BuildTutorDepsOptions {
  db: Db;
  llmAdapter: "fixture" | "real";
  anthropicApiKey?: string;
}

export function buildTutorDeps(opts: BuildTutorDepsOptions): TutorDeps {
  const model = opts.llmAdapter === "real" ? createLanguageModel({ apiKey: opts.anthropicApiKey ?? "" }) : undefined;

  return {
    conversationRepo: new SqliteConversationRepository(opts.db),
    chatModel: model ? new ClaudeChatModel(model) : new FixtureChatModel("valid"),
    citationExtractor: model ? new ClaudeCitationExtractor(model) : new FixtureCitationExtractor("valid"),
  };
}
