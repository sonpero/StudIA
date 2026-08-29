import type { JobQueue } from "../../jobs/index.js";

// Reads storedPath back off the job's own payload, the same lookup
// ingestion.retryExtraction/getDocument/listDocuments already use for
// their own job payloads (docs/modules/workspace.md's "Where the photo
// itself goes, and when it leaves"). Keyed on the job's own existence, not
// on whether it has any proposals: a legible-but-empty photo (zero
// proposals, a valid outcome) still needs its file cleaned up, and only
// the job row is guaranteed to exist in that case.
export async function findTodoPhotoUpload(jobQueue: JobQueue, userId: string, jobId: string): Promise<{ storedPath: string } | null> {
  const jobs = await jobQueue.listJobs(userId, "extract-todos");
  const job = jobs.find((j) => j.id === jobId);
  if (!job) return null;

  const payload = job.payload as { storedPath?: unknown };
  return typeof payload.storedPath === "string" ? { storedPath: payload.storedPath } : null;
}
