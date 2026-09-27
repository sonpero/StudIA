// Lets a job handler end a job as `failed` at once, without the jobs
// kernel's retries, for a failure that retrying cannot fix: content's split
// job when the model's output was truncated (the same chunk truncates again,
// and each attempt is billed). JobQueue.fail() already accepts
// { terminal: true } (docs/modules/jobs.md), but the kernel's runWorkerTick
// only passes it for an unregistered job type: a handler's Result carries a
// plain string. packages/core/src/jobs/ is frozen, so instead of changing
// that contract the worker wraps its own JobQueue: the handler flags the job
// id here, and the decorator turns the next fail() of that id terminal.
//
// Safe because the worker runs one job at a time in one process, and
// runWorkerTick calls fail() for a job right after its handler returns an
// error. The proper fix, a JobError able to carry a terminal flag, needs the
// jobs kernel thawed.
import type { FailOptions, Job, JobContext, JobError, JobQueue, Result, SplitJobResult } from "@studia/core";

export class TerminalFailureRegistry {
  private readonly jobIds = new Set<string>();

  mark(jobId: string): void {
    this.jobIds.add(jobId);
  }

  // One-shot: a flag must not outlive the fail() it was meant for.
  consume(jobId: string): boolean {
    return this.jobIds.delete(jobId);
  }
}

export class TerminalAwareJobQueue implements JobQueue {
  constructor(
    private readonly inner: JobQueue,
    private readonly registry: TerminalFailureRegistry,
  ) {}

  enqueue(userId: string, type: string, payload: unknown, now: Date): Promise<string> {
    return this.inner.enqueue(userId, type, payload, now);
  }

  claimNext(now: Date): Promise<Job | null> {
    return this.inner.claimNext(now);
  }

  complete(jobId: string, now: Date): Promise<void> {
    return this.inner.complete(jobId, now);
  }

  fail(jobId: string, error: string, now: Date, options?: FailOptions): Promise<void> {
    return this.inner.fail(jobId, error, now, this.registry.consume(jobId) ? { ...options, terminal: true } : options);
  }

  recoverStale(now: Date): Promise<number> {
    return this.inner.recoverStale(now);
  }

  listJobs(userId: string, type: string, createdAfter?: string): Promise<Pick<Job, "id" | "status" | "payload" | "lastError">[]> {
    return this.inner.listJobs(userId, type, createdAfter);
  }
}

export function recordTerminalFailures<T>(
  registry: TerminalFailureRegistry,
  handle: (payload: T, ctx: JobContext) => Promise<SplitJobResult>,
): (payload: T, ctx: JobContext) => Promise<Result<void, JobError>> {
  return async (payload, ctx) => {
    const result = await handle(payload, ctx);
    if (result.ok) return result;
    if (result.terminal) registry.mark(ctx.jobId);
    return { ok: false, error: result.error };
  };
}
