import type { FileStore } from "../../ingestion/index.js";
import type { JobQueue } from "../../jobs/index.js";
import { err, ok, type IdGenerator, type Result } from "../../shared/index.js";
import type { TodoRepository } from "../domain/ports.js";
import type { Todo } from "../domain/types.js";
import { findTodoPhotoUpload } from "./find-todo-photo-upload.js";

export interface ConfirmProposalsDeps {
  repo: TodoRepository;
  jobQueue: JobQueue;
  fileStore: FileStore;
  idGenerator: IdGenerator;
}

// Central invariant (docs/modules/workspace.md): a proposal reaches
// `todos` only through this call, never from handleTodoPhotoJob directly.
// Keyed on the job's own existence and ownership, not on whether it has
// proposals (see findTodoPhotoUpload). File deletion happens after the DB
// transaction commits, never inside it, and is never guarded by an
// existence check of its own — FileStore.delete already treats a missing
// file as a no-op.
export async function confirmProposals(deps: ConfirmProposalsDeps, userId: string, jobId: string, acceptedIds: string[], now: Date): Promise<Result<Todo[], "not-found">> {
  const upload = await findTodoPhotoUpload(deps.jobQueue, userId, jobId);
  if (!upload) return err("not-found");

  const proposals = await deps.repo.listProposals(userId, jobId);
  const todos: Todo[] = proposals
    .filter((p) => acceptedIds.includes(p.id))
    .map((p) => ({ id: deps.idGenerator.next(), userId, label: p.label, dueDate: p.dueDate, documentId: null, done: false, source: "photo", createdAt: now.toISOString() }));

  await deps.repo.confirmProposals(userId, jobId, todos);
  await deps.fileStore.delete(upload.storedPath);

  return ok(todos);
}
