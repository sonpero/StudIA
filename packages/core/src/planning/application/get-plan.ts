import { listNotions, type NotionRepository } from "../../content/index.js";
import { getNotionsProgress, type ReviewRepository } from "../../review/index.js";
import type { Result } from "../../shared/index.js";
import { buildPlan } from "../domain/build-plan.js";
import type { PlanningRepository } from "../domain/ports.js";
import type { Plan, PlanningInputError, PlanNotion } from "../domain/types.js";
import { ZERO_AVAILABILITY } from "../domain/types.js";

export interface GetPlanDeps {
  repo: PlanningRepository;
  notionRepo: NotionRepository;
  reviewRepo: ReviewRepository;
}

// Assembles buildPlan's input from this module's own tables (deadline,
// availability, history) plus notions and mastery read through content's
// and review's public interfaces, then returns buildPlan's Result unchanged
// (docs/modules/planning.md). Never persists the computation.
export async function getPlan(deps: GetPlanDeps, userId: string, documentId: string, now: Date): Promise<Result<Plan, PlanningInputError>> {
  const [notions, progress, deadline, availability, history] = await Promise.all([
    listNotions({ repo: deps.notionRepo }, userId, documentId),
    getNotionsProgress({ repo: deps.reviewRepo }, userId, documentId),
    deps.repo.getDeadline(userId, documentId),
    deps.repo.getAvailability(userId),
    deps.repo.getHistory(userId),
  ]);

  const progressByNotion = new Map(progress.map((p) => [p.notionId, p]));
  const planNotions: PlanNotion[] = notions.map((notion) => {
    const p = progressByNotion.get(notion.id);
    const mastered = p !== undefined && p.totalCards > 0 && p.masteredCards === p.totalCards;
    // review.getNotionsProgress exposes no per-notion mastery timestamp
    // (NotionProgress is just {masteredCards, totalCards}); buildPlan only
    // ever null-checks masteredAt, so any non-null ISO string works — the
    // notion's own createdAt is reused rather than inventing a sentinel.
    return { id: notion.id, difficulty: notion.difficulty, masteredAt: mastered ? notion.createdAt : null };
  });

  return buildPlan({
    notions: planNotions,
    deadline: deadline?.date ?? null,
    availability: availability ?? ZERO_AVAILABILITY,
    now,
    history,
  });
}
