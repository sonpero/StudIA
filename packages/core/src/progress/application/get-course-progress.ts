import type { NotionRepository } from "../../content/index.js";
import type { ReviewRepository } from "../../review/index.js";
import { err, ok, type Result } from "../../shared/index.js";
import { computeProgress, readinessProjectionDate } from "../domain/compute-progress.js";
import type { ProgressRepository } from "../domain/ports.js";
import type { CourseProgress, ProgressDeadlineInput } from "../domain/types.js";
import { assembleProgressNotions } from "./assemble-progress-notions.js";

export interface GetCourseProgressDeps {
  repo: ProgressRepository;
  notionRepo: NotionRepository;
  reviewRepo: ReviewRepository;
}

export type GetCourseProgressOk = { progress: CourseProgress; deadlineDate: string | null; deadlineLabel: string | null };
export type GetCourseProgressErr = { kind: "deadline-in-past"; deadlineDate: string; deadlineLabel: string | null };

// Assembles computeProgress's input from content.listNotions,
// review.getCardSchedulesForDocument + review.projectRetrievability, and
// this module's own getDeadline (fetched exactly once); calls
// computeProgress; returns a Result that also carries that same fetch's
// deadlineDate/deadlineLabel alongside the CourseProgress or the error
// (docs/modules/progress.md), so a caller can render the status phrase
// without a second read of the deadline. Never persists the computation.
export async function getCourseProgress(deps: GetCourseProgressDeps, userId: string, documentId: string, now: Date): Promise<Result<GetCourseProgressOk, GetCourseProgressErr>> {
  const [notions, cardRows, deadline] = await Promise.all([
    deps.notionRepo.listNotions(userId, documentId),
    deps.reviewRepo.getCardSchedulesForDocument(userId, documentId),
    deps.repo.getDeadline(userId, documentId),
  ]);

  const deadlineInput: ProgressDeadlineInput | null = deadline === null ? null : { date: deadline.date, setAt: deadline.createdAt };
  const projectionDate = readinessProjectionDate(deadlineInput, now);
  const progressNotions = assembleProgressNotions(notions, cardRows, projectionDate);

  const result = computeProgress({ notions: progressNotions, deadline: deadlineInput, now });
  if (!result.ok) {
    // The only way computeProgress returns Err is deadline.date in the
    // past, which requires a non-null deadline in the first place.
    return err({ kind: "deadline-in-past", deadlineDate: deadline!.date, deadlineLabel: deadline!.label });
  }
  return ok({ progress: result.value, deadlineDate: deadline?.date ?? null, deadlineLabel: deadline?.label ?? null });
}
