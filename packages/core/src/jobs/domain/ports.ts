import type { ZodType } from "zod";
import type { Result } from "../../shared/index.js";
import type { Job, JobContext, JobError } from "./types.js";

export interface JobHandler<T = unknown> {
  type: string;
  payloadSchema: ZodType<T>;
  handle(payload: T, ctx: JobContext): Promise<Result<void, JobError>>;
}

export interface FailOptions {
  // Skips the attempts/maxAttempts comparison and goes straight to `failed`.
  // Exists for exactly one caller: a job whose type has no registered
  // handler (see docs/modules/jobs.md, "fail()'s terminal option").
  terminal?: boolean;
}

export interface JobQueue {
  enqueue(userId: string, type: string, payload: unknown, now: Date): Promise<string>;
  claimNext(now: Date): Promise<Job | null>;
  complete(jobId: string, now: Date): Promise<void>;
  fail(jobId: string, error: string, now: Date, options?: FailOptions): Promise<void>;
  recoverStale(now: Date): Promise<number>;
  listJobs(userId: string, type: string, createdAfter?: string): Promise<Pick<Job, "id" | "status" | "payload" | "lastError">[]>;
}
