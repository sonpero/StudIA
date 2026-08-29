import type { FileStore } from "../../ingestion/index.js";
import type { JobContext, JobError } from "../../jobs/index.js";
import { err, ok, type IdGenerator, type Result } from "../../shared/index.js";
import type { TodoExtractor, TodoRepository } from "../domain/ports.js";
import type { TodoProposal } from "../domain/types.js";

export interface HandleTodoPhotoJobDeps {
  repo: TodoRepository;
  fileStore: FileStore;
  extractor: TodoExtractor;
  idGenerator: IdGenerator;
}

export interface ExtractTodoPhotoPayload {
  storedPath: string;
}

function toDateKey(iso: string): string {
  return iso.slice(0, 10);
}

// Read the photo, extract, replace this job's proposals (docs/modules/
// workspace.md). No LLM call happens inside a transaction: extract() is a
// plain awaited call, and replaceProposalsForJob's own transaction is only
// entered afterward, with plain data. legible: false fails the job with
// the extractor's own reason as last_error — same rule as
// ingestion.handleExtractionJob's identical check — never a success with
// zero proposals, which is reserved for a legible photo with genuinely
// nothing on it.
export async function handleTodoPhotoJob(deps: HandleTodoPhotoJobDeps, payload: ExtractTodoPhotoPayload, ctx: JobContext): Promise<Result<void, JobError>> {
  const bytes = await deps.fileStore.read(payload.storedPath);
  const result = await deps.extractor.extract({ bytes, today: toDateKey(ctx.now.toISOString()) });
  if (!result.ok) return err(result.error.message);
  if (!result.value.legible) return err(result.value.reason ?? "La photo est trop floue pour être lue.");

  const proposals: TodoProposal[] = result.value.todos.map((extracted) => ({
    id: deps.idGenerator.next(),
    jobId: ctx.jobId,
    userId: ctx.userId,
    label: extracted.label,
    dueDate: extracted.dueDate,
    subjectHint: extracted.subject,
    createdAt: ctx.now.toISOString(),
  }));

  await deps.repo.replaceProposalsForJob(ctx.userId, ctx.jobId, proposals);
  return ok(undefined);
}
