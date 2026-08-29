import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import {
  ClaudeCardGenerator,
  ClaudeNotionSplitter,
  ClaudeTodoExtractor,
  FixtureCardGenerator,
  FixtureDocumentExtractor,
  FixtureNotionSplitter,
  FixtureTodoExtractor,
  LocalFileStore,
  OfficeParserExtractor,
  SqliteCardRepository,
  SqliteDocumentRepository,
  SqliteJobQueue,
  SqliteNotionRepository,
  SqliteTodoRepository,
  VisionExtractor,
  cleanupAbandonedDocuments,
  createLanguageModel,
  handleExtractionJob,
  handleGenerationJob,
  handleSplitJob,
  handleTodoPhotoJob,
  runWorkerLoop,
  scheduleAbandonedDocumentCleanup,
  systemClock,
  uuidV7Generator,
  type CardGenerator,
  type CleanupAbandonedDocumentsPayload,
  type DocumentExtractor,
  type ExtractDocumentPayload,
  type ExtractTodoPhotoPayload,
  type GenerateCardsPayload,
  type JobHandler,
  type NotionSplitter,
  type SplitDocumentPayload,
  type TodoExtractor,
  type WorkerLoopSignal,
} from "@studia/core";
import { z } from "zod";
import { openDatabase } from "./db/connection.js";
import { runMigrations } from "./db/migrate.js";

const dataDir = process.env.DATA_DIR ?? path.resolve(process.cwd(), ".data");
if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });

const db = openDatabase(path.join(dataDir, "studia.db"));
runMigrations(db);

const jobQueue = new SqliteJobQueue(db, uuidV7Generator);
const repo = new SqliteDocumentRepository(db);
const fileStore = new LocalFileStore(dataDir);
const notionRepo = new SqliteNotionRepository(db);
const cardRepo = new SqliteCardRepository(db);
const todoRepo = new SqliteTodoRepository(db);

const llmAdapter = process.env.LLM_ADAPTER === "fixture" ? "fixture" : "real";
const extractors: DocumentExtractor[] =
  llmAdapter === "fixture"
    ? [new FixtureDocumentExtractor("valid"), new OfficeParserExtractor()]
    : [new OfficeParserExtractor(), new VisionExtractor(createLanguageModel({ apiKey: process.env.ANTHROPIC_API_KEY ?? "" }))];

const splitter: NotionSplitter =
  llmAdapter === "fixture"
    ? new FixtureNotionSplitter("valid")
    : new ClaudeNotionSplitter(createLanguageModel({ apiKey: process.env.ANTHROPIC_API_KEY ?? "" }));

const cardGenerator: CardGenerator =
  llmAdapter === "fixture"
    ? new FixtureCardGenerator("valid")
    : new ClaudeCardGenerator(createLanguageModel({ apiKey: process.env.ANTHROPIC_API_KEY ?? "" }));

const todoExtractor: TodoExtractor =
  llmAdapter === "fixture" ? new FixtureTodoExtractor("valid") : new ClaudeTodoExtractor(createLanguageModel({ apiKey: process.env.ANTHROPIC_API_KEY ?? "" }));

const extractDocumentHandler: JobHandler<ExtractDocumentPayload> = {
  type: "extract-document",
  payloadSchema: z.object({ documentId: z.string() }),
  handle: (payload, ctx) => handleExtractionJob({ repo, fileStore, extractors, jobQueue }, payload, ctx),
};

const splitNotionsHandler: JobHandler<SplitDocumentPayload> = {
  type: "split-notions",
  payloadSchema: z.object({ documentId: z.string() }),
  handle: (payload, ctx) => handleSplitJob({ notionRepo, documentRepo: repo, splitter, idGenerator: uuidV7Generator }, payload, ctx),
};

const generateCardsHandler: JobHandler<GenerateCardsPayload> = {
  type: "generate-cards",
  payloadSchema: z.object({ notionId: z.string(), types: z.array(z.enum(["flashcard", "mcq", "open"])) }),
  handle: (payload, ctx) => handleGenerationJob({ cardRepo, notionRepo, generator: cardGenerator, idGenerator: uuidV7Generator }, payload, ctx),
};

const cleanupAbandonedDocumentsHandler: JobHandler<CleanupAbandonedDocumentsPayload> = {
  type: "cleanup-abandoned-documents",
  payloadSchema: z.object({}),
  handle: (payload, ctx) => cleanupAbandonedDocuments({ repo, fileStore, jobQueue }, payload, ctx),
};

const extractTodosHandler: JobHandler<ExtractTodoPhotoPayload> = {
  type: "extract-todos",
  payloadSchema: z.object({ storedPath: z.string() }),
  handle: (payload, ctx) => handleTodoPhotoJob({ repo: todoRepo, fileStore, extractor: todoExtractor, idGenerator: uuidV7Generator }, payload, ctx),
};

const handlers = new Map<string, JobHandler>([
  [extractDocumentHandler.type, extractDocumentHandler],
  [splitNotionsHandler.type, splitNotionsHandler],
  [generateCardsHandler.type, generateCardsHandler],
  [cleanupAbandonedDocumentsHandler.type, cleanupAbandonedDocumentsHandler],
  [extractTodosHandler.type, extractTodosHandler],
]);

const signal: WorkerLoopSignal = { stopped: false };
process.on("SIGTERM", () => {
  signal.stopped = true;
});
process.on("SIGINT", () => {
  signal.stopped = true;
});

// Server-side safety net for a document a refused upload never rolled back
// (docs/modules/ingestion.md): run once at startup, same as recoverStaleJobs,
// then every 30 minutes, matching the abandonment threshold itself.
const CLEANUP_FAN_OUT_INTERVAL_MS = 30 * 60 * 1000;

function scheduleCleanupFanOut(): void {
  scheduleAbandonedDocumentCleanup({ repo, jobQueue }, systemClock.now()).catch((err: unknown) => {
    console.error("[worker] failed to schedule abandoned-document cleanup", err);
  });
}

scheduleCleanupFanOut();
setInterval(scheduleCleanupFanOut, CLEANUP_FAN_OUT_INTERVAL_MS);

runWorkerLoop({ jobQueue, handlers, clock: systemClock }, signal).catch((err: unknown) => {
  console.error("[worker] fatal error", err);
  process.exit(1);
});
