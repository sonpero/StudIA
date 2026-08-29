import {
  ClaudeTodoExtractor,
  createLanguageModel,
  FixtureTodoExtractor,
  LocalFileStore,
  SqliteTodoRepository,
  type TodoExtractor,
  type TodoRepository,
} from "@studia/core";
import type { Db } from "./db/connection.js";

export interface WorkspaceDeps {
  repo: TodoRepository;
  fileStore: LocalFileStore;
  extractor: TodoExtractor;
}

export interface BuildWorkspaceDepsOptions {
  db: Db;
  dataDir: string;
  llmAdapter: "fixture" | "real";
  anthropicApiKey?: string;
}

export function buildWorkspaceDeps(opts: BuildWorkspaceDepsOptions): WorkspaceDeps {
  const extractor = opts.llmAdapter === "fixture" ? new FixtureTodoExtractor("valid") : new ClaudeTodoExtractor(createLanguageModel({ apiKey: opts.anthropicApiKey ?? "" }));

  return { repo: new SqliteTodoRepository(opts.db), fileStore: new LocalFileStore(opts.dataDir), extractor };
}
