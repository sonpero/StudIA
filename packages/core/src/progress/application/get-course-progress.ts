import type { NotionRepository } from "../../content/index.js";
import type { ReviewRepository } from "../../review/index.js";
import { computeProgress, readinessProjectionDate } from "../domain/compute-progress.js";
import type { ProgressRepository } from "../domain/ports.js";
import type { CourseProgress, ProgressDeadlineInput } from "../domain/types.js";
import { assembleProgressNotions } from "./assemble-progress-notions.js";

export interface GetCourseProgressDeps {
  repo: ProgressRepository;
  notionRepo: NotionRepository;
  reviewRepo: ReviewRepository;
}

export type GetCourseProgressResult = { progress: CourseProgress; deadlineDate: string | null; deadlineLabel: string | null };

// Assembles computeProgress's input from content.listNotions,
// review.getCardSchedulesForDocument + review.projectRetrievability, and
// this module's own getDeadline (fetched exactly once); calls
// computeProgress; returns that same fetch's deadlineDate/deadlineLabel
// alongside the CourseProgress (docs/modules/progress.md), so a caller can
// render the status phrase without a second read of the deadline. Never
// persists the computation. Cannot fail — computeProgress itself can't
// (see its own comment), so a lapsed deadline is a normal result with
// progress.status === 'deadline-in-past', not a separate error branch.
export async function getCourseProgress(deps: GetCourseProgressDeps, userId: string, documentId: string, now: Date): Promise<GetCourseProgressResult> {
  const [notions, cardRows, deadline] = await Promise.all([
    deps.notionRepo.listNotions(userId, documentId),
    deps.reviewRepo.getCardSchedulesForDocument(userId, documentId),
    deps.repo.getDeadline(userId, documentId),
  ]);

  const deadlineInput: ProgressDeadlineInput | null = deadline === null ? null : { date: deadline.date, setAt: deadline.createdAt };
  const projectionDate = readinessProjectionDate(deadlineInput, now);
  const progressNotions = assembleProgressNotions(notions, cardRows, projectionDate);

  const progress = computeProgress({ notions: progressNotions, deadline: deadlineInput, now });
  return { progress, deadlineDate: deadline?.date ?? null, deadlineLabel: deadline?.label ?? null };
}
