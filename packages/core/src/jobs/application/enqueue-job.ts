import type { JobQueue } from "../domain/ports.js";

export interface EnqueueJobDeps {
  jobQueue: JobQueue;
}

// Callers never write to the jobs table directly (docs/modules/jobs.md).
export function enqueueJob(deps: EnqueueJobDeps, userId: string, type: string, payload: unknown, now: Date): Promise<string> {
  return deps.jobQueue.enqueue(userId, type, payload, now);
}
