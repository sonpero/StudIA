import type { JobQueue } from "../../jobs/index.js";
import { latestNotionStepStatuses, type DocumentNotionStepStatus } from "../domain/notion-step-status.js";

// The job type ingestion enqueues on extraction success and the worker
// registers content's handleSplitJob under (apps/worker/src/index.ts).
export const SPLIT_NOTIONS_JOB_TYPE = "split-notions";

export interface ListNotionStatusesDeps {
  jobQueue: JobQueue;
}

// One entry per document of the caller's that has ever had a split job; a
// document without one is still being read (ingestion's own status says
// so), so it gets no entry rather than a guessed one. lastError is dropped
// here on purpose: it is a developer-facing message, never shown to the
// student.
export async function listNotionStatuses(deps: ListNotionStatusesDeps, userId: string): Promise<DocumentNotionStepStatus[]> {
  const jobs = await deps.jobQueue.listJobs(userId, SPLIT_NOTIONS_JOB_TYPE);
  return latestNotionStepStatuses(jobs);
}
