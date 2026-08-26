import {
  FixtureDocumentExtractor,
  LocalFileStore,
  OfficeParserExtractor,
  SqliteDocumentRepository,
  VisionExtractor,
  createLanguageModel,
  uuidV7Generator,
  type DocumentExtractor,
} from "@studia/core";
import type { Db } from "./db/connection.js";

export interface IngestionDeps {
  repo: SqliteDocumentRepository;
  fileStore: LocalFileStore;
  extractors: DocumentExtractor[];
  idGenerator: typeof uuidV7Generator;
}

export interface BuildIngestionDepsOptions {
  db: Db;
  dataDir: string;
  llmAdapter: "fixture" | "real";
  anthropicApiKey?: string;
}

export function buildIngestionDeps(opts: BuildIngestionDepsOptions): IngestionDeps {
  const repo = new SqliteDocumentRepository(opts.db);
  const fileStore = new LocalFileStore(opts.dataDir);

  const extractors: DocumentExtractor[] =
    opts.llmAdapter === "fixture"
      ? [new FixtureDocumentExtractor("valid"), new OfficeParserExtractor()]
      : [new OfficeParserExtractor(), new VisionExtractor(createLanguageModel({ apiKey: opts.anthropicApiKey ?? "" }))];

  return { repo, fileStore, extractors, idGenerator: uuidV7Generator };
}
