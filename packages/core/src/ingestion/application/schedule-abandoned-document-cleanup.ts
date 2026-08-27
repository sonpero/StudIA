import { enqueueJob, type JobQueue } from "../../jobs/index.js";
import type { DocumentRepository } from "../domain/ports.js";

export interface ScheduleAbandonedDocumentCleanupDeps {
  repo: DocumentRepository;
  jobQueue: JobQueue;
}

// One cleanup-abandoned-documents job per document owner, each one properly
// scoped by userId once it runs (cleanup-abandoned-documents.ts). This is
// the fan-out step, meant to be called periodically by the worker
// (apps/worker), not from request-time code: jobs/** has no
// scheduling/cron primitive by design (docs/modules/jobs.md, "Out of
// scope: Cron and scheduled jobs"), and enqueue() always sets
// run_after = now, so there is no way to delay a job's first run through
// it either — periodicity has to live in the worker's own timer, not in a
// job that re-enqueues itself.
export async function scheduleAbandonedDocumentCleanup(deps: ScheduleAbandonedDocumentCleanupDeps, now: Date): Promise<void> {
  const userIds = await deps.repo.listDistinctUserIds();
  for (const userId of userIds) {
    await enqueueJob({ jobQueue: deps.jobQueue }, userId, "cleanup-abandoned-documents", {}, now);
  }
}
