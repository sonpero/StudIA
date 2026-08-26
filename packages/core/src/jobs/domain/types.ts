export type JobStatus = "pending" | "running" | "done" | "failed";

export type Job = {
  id: string;
  userId: string;
  type: string;
  payload: unknown;
  status: JobStatus;
  attempts: number;
  maxAttempts: number;
  lastError: string | null;
  runAfter: string;
  createdAt: string;
  updatedAt: string;
};

export type JobContext = { jobId: string; userId: string; attempt: number; now: Date };

// Handlers return this as the error side of their Result; JobQueue.fail()
// takes it as a plain string (docs/modules/jobs.md).
export type JobError = string;
