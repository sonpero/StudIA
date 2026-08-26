import type { JobQueue } from "../domain/ports.js";

export interface RecoverStaleJobsDeps {
  jobQueue: JobQueue;
}

// Runs once at worker startup: a Railway redeploy mid-job would otherwise
// orphan it in `running` forever (docs/modules/jobs.md).
export function recoverStaleJobs(deps: RecoverStaleJobsDeps, now: Date): Promise<number> {
  return deps.jobQueue.recoverStale(now);
}
