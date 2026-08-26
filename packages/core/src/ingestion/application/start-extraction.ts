import { enqueueJob, type JobQueue } from "../../jobs/index.js";
import { err, ok, type Result } from "../../shared/index.js";
import type { DocumentRepository } from "../domain/ports.js";

export interface StartExtractionDeps {
  repo: DocumentRepository;
  jobQueue: JobQueue;
}

export async function startExtraction(
  deps: StartExtractionDeps,
  userId: string,
  documentId: string,
  now: Date,
): Promise<Result<{ jobId: string }, "not-found">> {
  const document = await deps.repo.findDocument(userId, documentId);
  if (!document) return err("not-found");

  const jobId = await enqueueJob({ jobQueue: deps.jobQueue }, userId, "extract-document", { documentId }, now);
  return ok({ jobId });
}
