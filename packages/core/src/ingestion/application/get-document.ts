import type { JobQueue } from "../../jobs/index.js";
import { err, ok, type Result } from "../../shared/index.js";
import type { DocumentRepository } from "../domain/ports.js";
import type { Document } from "../domain/types.js";

export interface GetDocumentDeps {
  repo: DocumentRepository;
  jobQueue: JobQueue;
}

export type DocumentDetail = Document & { lastError: string | null; markdown: string | null };

export async function getDocument(deps: GetDocumentDeps, userId: string, documentId: string): Promise<Result<DocumentDetail, "not-found">> {
  const document = await deps.repo.findDocument(userId, documentId);
  if (!document) return err("not-found");

  const jobs = await deps.jobQueue.listJobs(userId, "extract-document");
  const latest = jobs.find((job) => {
    const payload = job.payload as { documentId?: unknown };
    return payload.documentId === documentId;
  });
  const status = latest ? latest.status : document.status;

  const extraction = status === "done" ? await deps.repo.getExtraction(userId, documentId) : null;

  return ok({
    ...document,
    status,
    lastError: latest?.lastError ?? null,
    markdown: extraction?.markdown ?? null,
  });
}
