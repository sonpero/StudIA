import type { Result } from "../../shared/index.js";
import type { Document, Extraction, Page, SourceType } from "./types.js";

export interface FileStore {
  put(userId: string, documentId: string, pageIndex: number, bytes: Buffer, ext: string): Promise<string>;
  read(storedPath: string): Promise<Buffer>;
  delete(storedPath: string): Promise<void>;
}

// Widened from docs/modules/ingestion.md's literal `Result<string, ExtractionError>`
// to `Result<ExtractionOutput, ExtractionError>`: the surrounding prose
// describes VisionExtractor's real output shape as `{ markdown, legible,
// reason? }` and is explicit that "legible: false is not an error, it is a
// result" — which a bare `string` success type cannot represent without an
// ad hoc sentinel value. OfficeParserExtractor always returns `legible: true`
// (there is no illegibility concept for a file that parses).
export type ExtractionOutput = { markdown: string; legible: boolean; reason?: string };

export type ExtractionError =
  | { kind: "corrupted-file"; message: string }
  | { kind: "model-error"; message: string };

export interface DocumentExtractor {
  supports(sourceType: SourceType): boolean;
  extract(input: { bytes: Buffer; sourceType: SourceType }): Promise<Result<ExtractionOutput, ExtractionError>>;
}

// Not in docs/modules/ingestion.md's Ports section (only FileStore and
// DocumentExtractor are listed there), but required by its own Use cases
// list (createDocument, addPage, getDocument, listDocuments, ...), which all
// need to read/write documents/pages/extractions. Every method takes
// userId and filters on it (CLAUDE.md: "a repository method without userId
// in its signature is a bug"). `status` on the returned Document is the
// stored/fallback value only — application/get-document.ts and
// application/list-documents.ts overlay it with the live job status via
// jobs' JobQueue.listJobs, since only the job (not this repository) knows
// whether a failure is a retry-pending one or truly terminal.
export interface DocumentRepository {
  createDocument(document: Document): Promise<void>;
  countDocuments(userId: string): Promise<number>;
  findDocument(userId: string, documentId: string): Promise<Document | null>;
  listDocuments(userId: string): Promise<Document[]>;
  addPage(userId: string, page: Page): Promise<void>;
  listPages(userId: string, documentId: string): Promise<Page[]>;
  findPageBySha256(userId: string, documentId: string, sha256: string): Promise<Page | null>;
  getPage(userId: string, documentId: string, index: number): Promise<Page | null>;
  upsertExtraction(userId: string, documentId: string, markdown: string, now: Date): Promise<void>;
  getExtraction(userId: string, documentId: string): Promise<Extraction | null>;
  deleteDocument(userId: string, documentId: string): Promise<Page[] | null>;
}
