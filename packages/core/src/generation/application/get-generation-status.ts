import type { JobQueue } from "../../jobs/index.js";
import { COURSE_GENERATION_JOB_TYPE } from "./request-course-cards.js";

export interface GetGenerationStatusDeps {
  jobQueue: JobQueue;
}

// { done, total, failed } for the course's latest generate-course-cards
// job (M11): total 1 once a job exists, 0 before. The per-notion
// generate-cards jobs of the removed flow are no longer counted.
export async function getGenerationStatus(
  deps: GetGenerationStatusDeps,
  userId: string,
  documentId: string,
): Promise<{ done: number; total: number; failed: number }> {
  // listJobs returns the newest first.
  const courseJob = (await deps.jobQueue.listJobs(userId, COURSE_GENERATION_JOB_TYPE)).find(
    (job) => (job.payload as { documentId?: unknown }).documentId === documentId,
  );
  if (!courseJob) return { done: 0, total: 0, failed: 0 };
  return { done: courseJob.status === "done" ? 1 : 0, total: 1, failed: courseJob.status === "failed" ? 1 : 0 };
}
