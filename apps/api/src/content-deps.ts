import {
  ClaudeNotionSplitter,
  FixtureNotionSplitter,
  SqliteNotionRepository,
  createLanguageModel,
  type NotionRepository,
  type NotionSplitter,
} from "@studia/core";
import type { Db } from "./db/connection.js";

export interface ContentDeps {
  repo: NotionRepository;
  splitter: NotionSplitter;
}

export interface BuildContentDepsOptions {
  db: Db;
  llmAdapter: "fixture" | "real";
  anthropicApiKey?: string;
}

export function buildContentDeps(opts: BuildContentDepsOptions): ContentDeps {
  const repo = new SqliteNotionRepository(opts.db);
  const splitter: NotionSplitter =
    opts.llmAdapter === "fixture"
      ? new FixtureNotionSplitter("valid")
      : new ClaudeNotionSplitter(createLanguageModel({ apiKey: opts.anthropicApiKey ?? "" }));

  return { repo, splitter };
}
