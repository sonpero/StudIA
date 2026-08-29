import type { NotionRepository } from "../../content/index.js";
import type { DocumentRepository } from "../../ingestion/index.js";
import { notionsBelowTargetForDocument, type NotionCardRow, type ProgressRepository } from "../../progress/index.js";
import type { ReviewRepository } from "../../review/index.js";
import { daysAway } from "../domain/days-away.js";
import type { TodoRepository } from "../domain/ports.js";
import type { TodayView } from "../domain/types.js";

export interface GetTodayDeps {
  todoRepo: TodoRepository;
  documentRepo: DocumentRepository;
  notionRepo: NotionRepository;
  reviewRepo: ReviewRepository;
  progressRepo: ProgressRepository;
}

function groupBy<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const list = map.get(key(item)) ?? [];
    list.push(item);
    map.set(key(item), list);
  }
  return map;
}

function toDateKey(iso: string): string {
  return iso.slice(0, 10);
}

// Composes docs/modules/workspace.md's TodayView from six raw reads, each
// made exactly once — never through progress.listProgress, which would
// redo three of them (docs/modules/progress.md's "Revised after review"
// note). dayBoundary is review's own client-computed "start of tomorrow"
// (apps/web/src/lib/day-boundary.ts's startOfTomorrowISO); now is the
// client-computed "today" progress's own routes already use — two
// different clocks for two different reasons, never conflated.
export async function getToday(deps: GetTodayDeps, userId: string, now: Date, dayBoundary: Date): Promise<TodayView> {
  const [documents, notions, dueCards, cardRows, deadlines, todos] = await Promise.all([
    deps.documentRepo.listDocuments(userId),
    deps.notionRepo.listNotionsForUser(userId),
    deps.reviewRepo.getDueCards(userId, dayBoundary, {}),
    deps.reviewRepo.getCardSchedulesForUser(userId),
    deps.progressRepo.getDeadlinesForUser(userId),
    deps.todoRepo.listTodos(userId),
  ]);

  const notionToDocument = new Map(notions.map((n) => [n.id, n.documentId]));
  const notionsByDocument = groupBy(notions, (n) => n.documentId);
  const cardRowsByDocument = groupBy(cardRows, (r) => r.documentId);
  const deadlineByDocument = new Map(deadlines.map((d) => [d.documentId, d]));

  const dueCountByDocument = new Map<string, number>();
  for (const card of dueCards) {
    const documentId = notionToDocument.get(card.notionId);
    if (documentId === undefined) continue;
    dueCountByDocument.set(documentId, (dueCountByDocument.get(documentId) ?? 0) + 1);
  }

  const dueCardsView = documents
    .map((d) => ({ documentId: d.id, documentTitle: d.title, colour: d.colour, count: dueCountByDocument.get(d.id) ?? 0 }))
    .filter((entry) => entry.count > 0);

  const notionsBelowTargetView = documents
    .map((d) => {
      const docNotions = notionsByDocument.get(d.id) ?? [];
      const docCardRows: NotionCardRow[] = (cardRowsByDocument.get(d.id) ?? []).map(({ notionId, cardId, schedule }) => ({ notionId, cardId, schedule }));
      const deadline = deadlineByDocument.get(d.id) ?? null;
      const ids = notionsBelowTargetForDocument(docNotions, docCardRows, deadline, now);
      return { documentId: d.id, documentTitle: d.title, colour: d.colour, count: ids.length };
    })
    .filter((entry) => entry.count > 0);

  const documentTitleById = new Map(documents.map((d) => [d.id, d.title]));
  const upcomingDeadlines = deadlines
    .map((deadline) => ({
      documentId: deadline.documentId,
      title: documentTitleById.get(deadline.documentId),
      deadlineDate: deadline.date,
      deadlineLabel: deadline.label,
      daysAway: daysAway(deadline.date, now),
    }))
    .filter((entry): entry is typeof entry & { title: string } => entry.title !== undefined && entry.daysAway >= 0);

  return {
    date: toDateKey(now.toISOString()),
    dueCards: dueCardsView,
    notionsBelowTarget: notionsBelowTargetView,
    todos,
    upcomingDeadlines,
  };
}
