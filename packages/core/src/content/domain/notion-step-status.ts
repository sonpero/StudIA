// The notion-creation step's own status, as the student sees it — derived
// from the split-notions job the same way ingestion derives a document's
// extraction status from its extract-document job, never from the job's
// error text.
export type NotionStepStatus = "pending" | "ready" | "failed";
// Mirrors jobs' JobStatus without importing it: domain/ stays free of any
// dependency on another module's surface.
export type SplitJobStatus = "pending" | "running" | "done" | "failed";
export type DocumentNotionStepStatus = { documentId: string; status: NotionStepStatus };

// A `pending` job may be one waiting out a retry backoff after a failed
// attempt: that is still "en cours" for the student, not a failure — only
// `failed` (retries exhausted) is.
export function notionStepStatusOf(status: SplitJobStatus): NotionStepStatus {
  switch (status) {
    case "pending":
    case "running":
      return "pending";
    case "done":
      return "ready";
    case "failed":
      return "failed";
  }
}

// `jobs` must be newest first (JobQueue.listJobs' own order): the first job
// seen for a document is its latest, and decides that document's status.
export function latestNotionStepStatuses(jobs: { status: SplitJobStatus; payload: unknown }[]): DocumentNotionStepStatus[] {
  const seen = new Set<string>();
  const statuses: DocumentNotionStepStatus[] = [];
  for (const job of jobs) {
    const documentId = documentIdOf(job.payload);
    if (documentId === null || seen.has(documentId)) continue;
    seen.add(documentId);
    statuses.push({ documentId, status: notionStepStatusOf(job.status) });
  }
  return statuses;
}

function documentIdOf(payload: unknown): string | null {
  if (typeof payload !== "object" || payload === null) return null;
  const documentId = (payload as { documentId?: unknown }).documentId;
  return typeof documentId === "string" ? documentId : null;
}
