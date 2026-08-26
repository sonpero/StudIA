export type { JobStatus, Job, JobContext, JobError } from "./domain/types.js";
export type { JobHandler, JobQueue, FailOptions } from "./domain/ports.js";

export { enqueueJob, type EnqueueJobDeps } from "./application/enqueue-job.js";
export { recoverStaleJobs, type RecoverStaleJobsDeps } from "./application/recover-stale-jobs.js";
export { runWorkerTick, type WorkerTickDeps } from "./application/run-worker-tick.js";

export { SqliteJobQueue, type JobsDb } from "./infra/sqlite-job-queue.js";
export { runWorkerLoop, type WorkerLoopDeps, type WorkerLoopSignal } from "./infra/worker-loop.js";
// Exported so apps/api/src/db/schema.ts's drizzle-kit glob picks it up, same
// reason as identity/index.ts's usersTable export.
export { jobsTable } from "./infra/schema.js";
