import type { DocumentRepository } from "../../ingestion/index.js";
import type { NotionRepository } from "../../content/index.js";
import type { ReviewRepository } from "../../review/index.js";
import { computeProgress, readinessProjectionDate } from "../domain/compute-progress.js";
import type { Deadline, ProgressRepository } from "../domain/ports.js";
import type { CourseProgress, ProgressDeadlineInput } from "../domain/types.js";
import { assembleProgressNotions, type NotionCardRow } from "./assemble-progress-notions.js";

export interface ListProgressDeps {
  repo: ProgressRepository;
  documentRepo: DocumentRepository;
  notionRepo: NotionRepository;
  reviewRepo: ReviewRepository;
}

export type ProgressListItem =
  | { documentId: string; title: string; deadlineDate: string | null; deadlineLabel: string | null; kind: "ok"; progress: CourseProgress }
  | { documentId: string; title: string; deadlineDate: string; deadlineLabel: string | null; kind: "error"; error: "deadline-in-past" };

function groupBy<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const list = map.get(key(item)) ?? [];
    list.push(item);
    map.set(key(item), list);
  }
  return map;
}

// getCourseProgress for every one of the user's documents, without an N+1 read:
// four batched reads total (documents, every notion, every active card's
// schedule, every deadline — docs/modules/progress.md), never one pair per
// document. Iterates over documentRepo.listDocuments, never over the
// grouping Maps below: a document with zero notions/cards/deadline is
// absent from all three buckets and must still produce a coverage-0/
// readiness-0 entry, not silently disappear from the list. A document
// whose computeProgress call errors (deadline-in-past) is kept in the
// list, flagged, not dropped — a stale exam date is something the person
// can act on.
export async function listProgress(deps: ListProgressDeps, userId: string, now: Date): Promise<ProgressListItem[]> {
  const [documents, allNotions, allCardRows, allDeadlines] = await Promise.all([
    deps.documentRepo.listDocuments(userId),
    deps.notionRepo.listNotionsForUser(userId),
    deps.reviewRepo.getCardSchedulesForUser(userId),
    deps.repo.getDeadlinesForUser(userId),
  ]);

  const notionsByDocument = groupBy(allNotions, (n) => n.documentId);
  const cardRowsByDocument = groupBy<NotionCardRow & { documentId: string }>(allCardRows, (r) => r.documentId);
  const deadlineByDocument = new Map<string, Deadline>(allDeadlines.map((d) => [d.documentId, d]));

  return documents.map((document): ProgressListItem => {
    const notions = notionsByDocument.get(document.id) ?? [];
    const cardRows = cardRowsByDocument.get(document.id) ?? [];
    const deadline = deadlineByDocument.get(document.id) ?? null;

    const deadlineInput: ProgressDeadlineInput | null = deadline === null ? null : { date: deadline.date, setAt: deadline.createdAt };
    const projectionDate = readinessProjectionDate(deadlineInput, now);
    const progressNotions = assembleProgressNotions(notions, cardRows, projectionDate);

    const result = computeProgress({ notions: progressNotions, deadline: deadlineInput, now });
    if (!result.ok) {
      return { documentId: document.id, title: document.title, deadlineDate: deadline!.date, deadlineLabel: deadline!.label, kind: "error", error: "deadline-in-past" };
    }
    return { documentId: document.id, title: document.title, deadlineDate: deadline?.date ?? null, deadlineLabel: deadline?.label ?? null, kind: "ok", progress: result.value };
  });
}
