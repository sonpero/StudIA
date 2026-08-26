import { err, ok, type Result } from "../../shared/index.js";
import type { DocumentExtractor, DocumentRepository, FileStore } from "../domain/ports.js";
import type { JobContext, JobError } from "../../jobs/index.js";

export interface HandleExtractionJobDeps {
  repo: DocumentRepository;
  fileStore: FileStore;
  extractors: DocumentExtractor[];
}

export interface ExtractDocumentPayload {
  documentId: string;
}

// Read pages in order, run the right extractor per page, concatenate, write
// extractions, set status (docs/modules/ingestion.md). Idempotent:
// upsertExtraction deletes any existing row for the document before
// inserting, so running this twice after a worker restart leaves exactly
// one extraction row. No LLM call happens inside a transaction: every
// extract() call below is a plain awaited call, not wrapped in any write
// transaction — only the repository's own upsertExtraction is.
export async function handleExtractionJob(
  deps: HandleExtractionJobDeps,
  payload: ExtractDocumentPayload,
  ctx: JobContext,
): Promise<Result<void, JobError>> {
  const document = await deps.repo.findDocument(ctx.userId, payload.documentId);
  if (!document) return err(`Document ${payload.documentId} not found for user ${ctx.userId}`);

  const extractor = deps.extractors.find((e) => e.supports(document.sourceType));
  if (!extractor) return err(`No extractor supports source type "${document.sourceType}"`);

  const pages = await deps.repo.listPages(ctx.userId, payload.documentId);
  const markdownParts: string[] = [];

  for (const page of pages) {
    const bytes = await deps.fileStore.read(page.storedPath);
    const result = await extractor.extract({ bytes, sourceType: document.sourceType });
    if (!result.ok) {
      return err(result.error.kind === "corrupted-file" || result.error.kind === "model-error" ? result.error.message : "extraction failed");
    }
    if (!result.value.legible) {
      return err(result.value.reason ?? "La photo est trop floue pour être lue.");
    }
    markdownParts.push(result.value.markdown);
  }

  await deps.repo.upsertExtraction(ctx.userId, payload.documentId, markdownParts.join("\n\n"), ctx.now);
  return ok(undefined);
}
