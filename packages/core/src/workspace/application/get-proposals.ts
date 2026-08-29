import type { JobQueue, JobStatus } from "../../jobs/index.js";
import { err, ok, type Result } from "../../shared/index.js";
import type { TodoRepository } from "../domain/ports.js";
import type { TodoProposal } from "../domain/types.js";
import { findTodoPhotoUpload } from "./find-todo-photo-upload.js";

export interface GetProposalsDeps {
  repo: TodoRepository;
  jobQueue: JobQueue;
}

export type GetProposalsResult = { status: JobStatus; lastError: string | null; proposals: TodoProposal[] };

// Keyed on the job's own existence, same reasoning as confirmProposals/
// rejectProposals: a legible-but-empty photo's job is a valid Ok with an
// empty array, not a not-found. status/lastError are what let the
// confirmation screen tell "still extracting" (pending/running) from
// "done, genuinely nothing found" (done, empty) from "failed" (failed,
// lastError) — all three would otherwise look identical (an empty array).
export async function getProposals(deps: GetProposalsDeps, userId: string, jobId: string): Promise<Result<GetProposalsResult, "not-found">> {
  const upload = await findTodoPhotoUpload(deps.jobQueue, userId, jobId);
  if (!upload) return err("not-found");

  const proposals = await deps.repo.listProposals(userId, jobId);
  return ok({ status: upload.status, lastError: upload.lastError, proposals });
}
