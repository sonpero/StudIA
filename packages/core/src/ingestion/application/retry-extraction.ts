import { enqueueJob, type JobQueue } from "../../jobs/index.js";
import { err, ok, type Result } from "../../shared/index.js";
import type { DocumentRepository } from "../domain/ports.js";

export interface RetryExtractionDeps {
  repo: DocumentRepository;
  jobQueue: JobQueue;
}

// Only from `failed` (docs/modules/ingestion.md). "Failed" here means the
// document's latest extraction job has truly exhausted its retries — not
// merely that its last attempt errored (see jobs/domain/ports.ts's
// `fail()` doc comment): checking the live job status, not a stored
// documents.status column, is what keeps this correct while an automatic
// retry is still pending.
export async function retryExtraction(
  deps: RetryExtractionDeps,
  userId: string,
  documentId: string,
  now: Date,
): Promise<Result<{ jobId: string }, "not-found" | "not-failed">> {
  const document = await deps.repo.findDocument(userId, documentId);
  if (!document) return err("not-found");

  const jobs = await deps.jobQueue.listJobs(userId, "extract-document");
  const latest = jobs.find((job) => {
    const payload = job.payload as { documentId?: unknown };
    return payload.documentId === documentId;
  });
  if (!latest || latest.status !== "failed") return err("not-failed");

  const jobId = await enqueueJob({ jobQueue: deps.jobQueue }, userId, "extract-document", { documentId }, now);
  return ok({ jobId });
}
