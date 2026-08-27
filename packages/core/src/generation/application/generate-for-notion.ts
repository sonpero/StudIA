import { enqueueJob, type JobQueue } from "../../jobs/index.js";
import type { CardType } from "../domain/types.js";

export interface GenerateForNotionDeps {
  jobQueue: JobQueue;
}

// Manual regeneration (docs/modules/generation.md). Generation is NEVER
// triggered automatically after splitting: it costs tokens and the user may
// want to review the notions first. documentId is optional and carried
// only for GET /api/documents/:id/generation-status, which derives
// { done, total, failed } by filtering jobs.listJobs('generate-cards') on
// payload.documentId (docs/modules/generation.md's API table) — the
// notion->document lookup itself lives in the route/wiring layer, not here.
export async function generateForNotion(
  deps: GenerateForNotionDeps,
  userId: string,
  notionId: string,
  types: CardType[],
  now: Date,
  documentId?: string,
): Promise<{ jobId: string }> {
  const payload = documentId ? { notionId, types, documentId } : { notionId, types };
  const jobId = await enqueueJob({ jobQueue: deps.jobQueue }, userId, "generate-cards", payload, now);
  return { jobId };
}
