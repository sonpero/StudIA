import type { JobHandler, JobQueue } from "../domain/ports.js";
import type { JobContext } from "../domain/types.js";

export interface WorkerTickDeps {
  jobQueue: JobQueue;
  handlers: Map<string, JobHandler>;
}

// One polling cycle: claim, dispatch, record. No real timers here — that is
// infra/worker-loop.ts's job — which is what keeps this fully testable with
// an injected `now` instead of fake timers (docs/TESTING.md).
export async function runWorkerTick(deps: WorkerTickDeps, now: Date): Promise<"claimed" | "empty"> {
  const job = await deps.jobQueue.claimNext(now);
  if (!job) return "empty";

  const handler = deps.handlers.get(job.type);
  if (!handler) {
    // Missing handler is a worker configuration problem, not a transient
    // failure: retrying would just repeat the same outcome after real
    // backoff delays. terminal:true skips straight to `failed`
    // (docs/modules/jobs.md).
    await deps.jobQueue.fail(job.id, `No handler registered for job type "${job.type}"`, now, { terminal: true });
    return "claimed";
  }

  const parsed = handler.payloadSchema.safeParse(job.payload);
  if (!parsed.success) {
    await deps.jobQueue.fail(job.id, `Invalid payload for job type "${job.type}": ${parsed.error.message}`, now);
    return "claimed";
  }

  const ctx: JobContext = { jobId: job.id, userId: job.userId, attempt: job.attempts + 1, now };
  const result = await handler.handle(parsed.data, ctx);

  if (result.ok) {
    await deps.jobQueue.complete(job.id, now);
  } else {
    await deps.jobQueue.fail(job.id, result.error, now);
  }
  return "claimed";
}
