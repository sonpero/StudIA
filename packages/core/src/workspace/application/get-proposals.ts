import type { JobQueue } from "../../jobs/index.js";
import { err, ok, type Result } from "../../shared/index.js";
import type { TodoRepository } from "../domain/ports.js";
import type { TodoProposal } from "../domain/types.js";
import { findTodoPhotoUpload } from "./find-todo-photo-upload.js";

export interface GetProposalsDeps {
  repo: TodoRepository;
  jobQueue: JobQueue;
}

// Keyed on the job's own existence, same reasoning as confirmProposals/
// rejectProposals: a legible-but-empty photo's job is a valid Ok with an
// empty array, not a not-found.
export async function getProposals(deps: GetProposalsDeps, userId: string, jobId: string): Promise<Result<TodoProposal[], "not-found">> {
  const upload = await findTodoPhotoUpload(deps.jobQueue, userId, jobId);
  if (!upload) return err("not-found");

  return ok(await deps.repo.listProposals(userId, jobId));
}
