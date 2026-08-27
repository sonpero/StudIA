import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import {
  FixtureDocumentExtractor,
  LocalFileStore,
  OfficeParserExtractor,
  SqliteDocumentRepository,
  SqliteJobQueue,
  VisionExtractor,
  cleanupAbandonedDocuments,
  createLanguageModel,
  handleExtractionJob,
  runWorkerLoop,
  scheduleAbandonedDocumentCleanup,
  systemClock,
  uuidV7Generator,
  type CleanupAbandonedDocumentsPayload,
  type DocumentExtractor,
  type ExtractDocumentPayload,
  type JobHandler,
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

const llmAdapter = process.env.LLM_ADAPTER === "fixture" ? "fixture" : "real";
const extractors: DocumentExtractor[] =
  llmAdapter === "fixture"
    ? [new FixtureDocumentExtractor("valid"), new OfficeParserExtractor()]
    : [new OfficeParserExtractor(), new VisionExtractor(createLanguageModel({ apiKey: process.env.ANTHROPIC_API_KEY ?? "" }))];

const extractDocumentHandler: JobHandler<ExtractDocumentPayload> = {
  type: "extract-document",
  payloadSchema: z.object({ documentId: z.string() }),
  handle: (payload, ctx) => handleExtractionJob({ repo, fileStore, extractors }, payload, ctx),
};

const cleanupAbandonedDocumentsHandler: JobHandler<CleanupAbandonedDocumentsPayload> = {
  type: "cleanup-abandoned-documents",
  payloadSchema: z.object({}),
  handle: (payload, ctx) => cleanupAbandonedDocuments({ repo, fileStore, jobQueue }, payload, ctx),
};

const handlers = new Map<string, JobHandler>([
  [extractDocumentHandler.type, extractDocumentHandler],
  [cleanupAbandonedDocumentsHandler.type, cleanupAbandonedDocumentsHandler],
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
