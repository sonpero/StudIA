import type { JobQueue } from "../../jobs/index.js";

export interface GetGenerationStatusDeps {
  jobQueue: JobQueue;
}

// { done, total, failed }, derived from jobs.listJobs('generate-cards')
// filtered by payload.documentId (docs/modules/generation.md's API table).
// A notion nobody has ever requested generation for has no job and is not
// counted — this mirrors the API spec literally, at the cost of "total"
// meaning "notions attempted", not "notions in the document" (that would
// need a lookup into content, which this generation-only use case avoids).
export async function getGenerationStatus(
  deps: GetGenerationStatusDeps,
  userId: string,
  documentId: string,
): Promise<{ done: number; total: number; failed: number }> {
  const jobs = await deps.jobQueue.listJobs(userId, "generate-cards");

  const latestByNotion = new Map<string, (typeof jobs)[number]>();
  for (const job of jobs) {
    const payload = job.payload as { notionId?: unknown; documentId?: unknown };
    if (payload.documentId !== documentId || typeof payload.notionId !== "string") continue;
    if (!latestByNotion.has(payload.notionId)) latestByNotion.set(payload.notionId, job);
  }

  let done = 0;
  let failed = 0;
  for (const job of latestByNotion.values()) {
    if (job.status === "done") done += 1;
    else if (job.status === "failed") failed += 1;
  }

  return { done, total: latestByNotion.size, failed };
}
