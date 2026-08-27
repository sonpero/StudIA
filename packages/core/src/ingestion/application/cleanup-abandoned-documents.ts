import type { JobContext, JobError, JobQueue } from "../../jobs/index.js";
import { ok, type Result } from "../../shared/index.js";
import { isAbandonedDocument } from "../domain/is-abandoned.js";
import type { DocumentRepository, FileStore } from "../domain/ports.js";
import { deleteDocument } from "./delete-document.js";

export interface CleanupAbandonedDocumentsDeps {
  repo: DocumentRepository;
  fileStore: FileStore;
  jobQueue: JobQueue;
}

export type CleanupAbandonedDocumentsPayload = Record<string, never>;

// Server-side safety net for UploadCard.tsx's client-side rollback: a course
// refused on screen (e.g. a duplicate page) deletes its own document via
// DELETE /api/documents/:id, but that call is best-effort — a closed tab or
// a dropped connection at exactly the wrong moment leaves the document
// behind with no extract-document job ever enqueued for it
// (docs/modules/ingestion.md). Scoped to ctx.userId like every other
// handler: the fan-out that decides which users to run this for lives in
// schedule-abandoned-document-cleanup.ts, the one place allowed to look
// across users. Idempotent: deleteDocument is a no-op ("not-found") for a
// document a previous run (or the client itself) already removed, so
// running this twice never errors.
export async function cleanupAbandonedDocuments(
  deps: CleanupAbandonedDocumentsDeps,
  _payload: CleanupAbandonedDocumentsPayload,
  ctx: JobContext,
): Promise<Result<void, JobError>> {
  const [documents, extractionJobs] = await Promise.all([
    deps.repo.listDocuments(ctx.userId),
    deps.jobQueue.listJobs(ctx.userId, "extract-document"),
  ]);

  const documentIdsWithJob = new Set(
    extractionJobs
      .map((job) => (job.payload as { documentId?: unknown }).documentId)
      .filter((documentId): documentId is string => typeof documentId === "string"),
  );

  for (const document of documents) {
    if (isAbandonedDocument(document.createdAt, documentIdsWithJob.has(document.id), ctx.now)) {
      await deleteDocument({ repo: deps.repo, fileStore: deps.fileStore }, ctx.userId, document.id);
    }
  }

  return ok(undefined);
}
