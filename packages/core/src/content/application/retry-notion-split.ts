import type { DocumentRepository } from "../../ingestion/index.js";
import { enqueueJob, type JobQueue } from "../../jobs/index.js";
import { err, ok, type Result } from "../../shared/index.js";
import { latestNotionStepStatuses } from "../domain/notion-step-status.js";
import { SPLIT_NOTIONS_JOB_TYPE } from "./list-notion-statuses.js";

export interface RetryNotionSplitDeps {
  documentRepo: DocumentRepository;
  jobQueue: JobQueue;
}

// Mirrors ingestion's retryExtraction, for the notion step only: never
// re-runs extraction. Only from `failed` (retries exhausted) — a split job
// still pending, even one waiting out a backoff after a failed attempt, is
// already going to run again on its own.
export async function retryNotionSplit(
  deps: RetryNotionSplitDeps,
  userId: string,
  documentId: string,
  now: Date,
): Promise<Result<{ jobId: string }, "not-found" | "not-failed">> {
  const document = await deps.documentRepo.findDocument(userId, documentId);
  if (!document) return err("not-found");

  const jobs = await deps.jobQueue.listJobs(userId, SPLIT_NOTIONS_JOB_TYPE);
  const latest = latestNotionStepStatuses(jobs).find((entry) => entry.documentId === documentId);
  if (latest?.status !== "failed") return err("not-failed");

  const jobId = await enqueueJob({ jobQueue: deps.jobQueue }, userId, SPLIT_NOTIONS_JOB_TYPE, { documentId }, now);
  return ok({ jobId });
}
