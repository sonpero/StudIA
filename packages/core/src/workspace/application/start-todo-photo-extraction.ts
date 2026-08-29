import type { FileStore } from "../../ingestion/index.js";
import { enqueueJob, type JobQueue } from "../../jobs/index.js";
import type { IdGenerator } from "../../shared/index.js";

export interface StartTodoPhotoExtractionDeps {
  fileStore: FileStore;
  jobQueue: JobQueue;
  idGenerator: IdGenerator;
}

// Images only — a school planner photo, never a pdf/docx like ingestion's
// own uploads. Falls back to "bin" for anything unrecognised the same way
// ingestion's own EXT_BY_MIME does; the extension is cosmetic once the
// bytes have been read (TodoExtractor never dispatches by file type).
const EXT_BY_MIME: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

// Generates its own id for the upload's path rather than the job's id: a
// job doesn't exist (and its id is unknown) until enqueueJob returns,
// which happens after the file must already be written (docs/modules/
// workspace.md's "uploadId, not jobId").
export async function startTodoPhotoExtraction(deps: StartTodoPhotoExtractionDeps, userId: string, bytes: Buffer, mimeType: string, now: Date): Promise<{ jobId: string }> {
  const uploadId = deps.idGenerator.next();
  const ext = EXT_BY_MIME[mimeType] ?? "bin";
  const storedPath = await deps.fileStore.put(userId, uploadId, 0, bytes, ext);

  const jobId = await enqueueJob({ jobQueue: deps.jobQueue }, userId, "extract-todos", { storedPath }, now);
  return { jobId };
}
