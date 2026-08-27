export type { SourceType, ExtractionStatus, Document, Page, Extraction } from "./domain/types.js";
export type {
  FileStore,
  DocumentExtractor,
  DocumentRepository,
  ExtractionOutput,
  ExtractionError,
} from "./domain/ports.js";

export { createDocument, type CreateDocumentDeps } from "./application/create-document.js";
export { addPage, type AddPageDeps, type AddPageError } from "./application/add-page.js";
export { startExtraction, type StartExtractionDeps } from "./application/start-extraction.js";
export {
  handleExtractionJob,
  type HandleExtractionJobDeps,
  type ExtractDocumentPayload,
} from "./application/handle-extraction-job.js";
export { retryExtraction, type RetryExtractionDeps } from "./application/retry-extraction.js";
export { getDocument, type GetDocumentDeps, type DocumentDetail } from "./application/get-document.js";
export { listDocuments, type ListDocumentsDeps } from "./application/list-documents.js";
export { readPageFile, type ReadPageFileDeps } from "./application/read-page-file.js";
export { deleteDocument, type DeleteDocumentDeps } from "./application/delete-document.js";
export {
  cleanupAbandonedDocuments,
  type CleanupAbandonedDocumentsDeps,
  type CleanupAbandonedDocumentsPayload,
} from "./application/cleanup-abandoned-documents.js";
export {
  scheduleAbandonedDocumentCleanup,
  type ScheduleAbandonedDocumentCleanupDeps,
} from "./application/schedule-abandoned-document-cleanup.js";
export { ABANDONED_DOCUMENT_THRESHOLD_MS } from "./domain/is-abandoned.js";

export { SqliteDocumentRepository, type IngestionDb } from "./infra/sqlite-document-repository.js";
export { LocalFileStore } from "./infra/local-file-store.js";
export { OfficeParserExtractor } from "./infra/office-parser-extractor.js";
export { VisionExtractor } from "./infra/vision-extractor.js";
export { FixtureDocumentExtractor, type FixtureCase } from "./infra/fixture-document-extractor.js";
// For apps/api/drizzle.config.ts's glob (same reason as identity/jobs).
export { documentsTable, pagesTable, extractionsTable } from "./infra/schema.js";
