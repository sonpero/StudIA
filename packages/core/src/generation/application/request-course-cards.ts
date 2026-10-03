import type { NotionRepository } from "../../content/index.js";
import { enqueueJob, type JobQueue } from "../../jobs/index.js";
import { err, ok, type Result } from "../../shared/index.js";
import type { KeyNotionRepository } from "../domain/ports.js";

export interface RequestCourseCardsDeps {
  jobQueue: JobQueue;
  keyNotionRepo: KeyNotionRepository;
  notionRepo: NotionRepository;
}

export type RequestCourseCardsError = "not-found" | "has-cards" | "in-progress";

export const COURSE_GENERATION_JOB_TYPE = "generate-course-cards";

// M11's single trigger (docs/reports/notions-cles-conception.md): one job
// for the whole course, all card types. Never for a course that already has
// cards (no regeneration), nor twice at once (the second would only wait
// for the first and pay again if the first failed).
export async function requestCourseCards(
  deps: RequestCourseCardsDeps,
  userId: string,
  documentId: string,
  now: Date,
): Promise<Result<{ jobId: string }, RequestCourseCardsError>> {
  const notions = await deps.notionRepo.listNotions(userId, documentId);
  if (notions.length === 0) return err("not-found");
  if ((await deps.keyNotionRepo.countCardsForDocument(userId, documentId)) > 0) return err("has-cards");

  const jobs = await deps.jobQueue.listJobs(userId, COURSE_GENERATION_JOB_TYPE);
  const active = jobs.some(
    (job) => (job.payload as { documentId?: unknown }).documentId === documentId && (job.status === "pending" || job.status === "running"),
  );
  if (active) return err("in-progress");

  const jobId = await enqueueJob({ jobQueue: deps.jobQueue }, userId, COURSE_GENERATION_JOB_TYPE, { documentId }, now);
  return ok({ jobId });
}
