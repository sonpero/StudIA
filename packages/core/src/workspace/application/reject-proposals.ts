import type { FileStore } from "../../ingestion/index.js";
import type { JobQueue } from "../../jobs/index.js";
import { err, ok, type Result } from "../../shared/index.js";
import type { TodoRepository } from "../domain/ports.js";
import { findTodoPhotoUpload } from "./find-todo-photo-upload.js";

export interface RejectProposalsDeps {
  repo: TodoRepository;
  jobQueue: JobQueue;
  fileStore: FileStore;
}

// Functionally, confirmProposals(..., acceptedIds: []) does the identical
// thing at the storage layer — kept as its own function and route anyway,
// because "I don't want any of these" and "I want some of these" are
// different intents for the person using the confirmation screen, even
// when their effect on the data coincides (docs/modules/workspace.md).
export async function rejectProposals(deps: RejectProposalsDeps, userId: string, jobId: string): Promise<Result<void, "not-found">> {
  const upload = await findTodoPhotoUpload(deps.jobQueue, userId, jobId);
  if (!upload) return err("not-found");

  await deps.repo.deleteProposals(userId, jobId);
  await deps.fileStore.delete(upload.storedPath);

  return ok(undefined);
}
