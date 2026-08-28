import type { DocumentRepository } from "../../ingestion/index.js";
import type { NotionRepository } from "../../content/index.js";
import type { ReviewRepository } from "../../review/index.js";
import type { PlanningRepository } from "../domain/ports.js";
import type { PlanEntry } from "../domain/types.js";
import { getPlan } from "./get-plan.js";

export interface GetTodayDeps {
  repo: PlanningRepository;
  documentRepo: DocumentRepository;
  notionRepo: NotionRepository;
  reviewRepo: ReviewRepository;
}

export type TodayEntry = PlanEntry & { documentId: string };

// Today's entries across every one of the user's courses (docs/modules/planning.md).
// A document whose plan is a PlanningInputError (e.g. availability never
// set) simply contributes nothing here — the per-document plan route is
// where that error is surfaced, not this aggregate.
export async function getToday(deps: GetTodayDeps, userId: string, now: Date): Promise<TodayEntry[]> {
  const documents = await deps.documentRepo.listDocuments(userId);
  const todayKey = now.toISOString().slice(0, 10);

  const results = await Promise.all(documents.map((document) => getPlan(deps, userId, document.id, now)));

  const entries: TodayEntry[] = [];
  results.forEach((result, i) => {
    if (!result.ok) return;
    const today = result.value.days.find((d) => d.date === todayKey);
    if (!today) return;
    const documentId = documents[i]!.id;
    entries.push(...today.entries.map((entry) => ({ ...entry, documentId })));
  });
  return entries;
}
