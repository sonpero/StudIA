import type { NotionProgress, ReviewRepository } from "../domain/ports.js";

export interface GetNotionsProgressDeps {
  repo: ReviewRepository;
}

// The picker's own "Notions" redesign wants a per-notion review count, next-
// due date, and due-now flag the raw NotionProgress shape doesn't carry —
// composed here from getCardSchedulesForDocument, a read every other
// consumer of this module already relies on (progress's own
// notionsBelowTargetForDocument), rather than adding a second SQL query: no
// port or schema change needed.
export type NotionProgressWithSchedule = NotionProgress & { reps: number; nextDueDate: string | null; dueNow: boolean };

// nextDueDate: same rule as getProgress (docs/modules/review.md) — the
// earliest due date at or after dayBoundary among the notion's own active
// cards, or null if none are upcoming. dueNow: the exact predicate
// getDueCards' own SQL applies per card (due IS NULL OR due < dayBoundary,
// sqlite-review-repository.ts) — a card never reviewed counts as due, same
// as a card whose due date has already passed; reps counts every review
// regardless of whether its card is currently due.
export async function getNotionsProgress(
  deps: GetNotionsProgressDeps,
  userId: string,
  documentId: string,
  dayBoundary: Date,
): Promise<NotionProgressWithSchedule[]> {
  const [progress, cardRows] = await Promise.all([
    deps.repo.getNotionsProgress(userId, documentId),
    deps.repo.getCardSchedulesForDocument(userId, documentId),
  ]);

  const rowsByNotion = new Map<string, typeof cardRows>();
  for (const row of cardRows) {
    const list = rowsByNotion.get(row.notionId) ?? [];
    list.push(row);
    rowsByNotion.set(row.notionId, list);
  }

  return progress.map((notion) => {
    const rows = rowsByNotion.get(notion.notionId) ?? [];
    const reps = rows.reduce((sum, row) => sum + (row.schedule?.reps ?? 0), 0);
    const upcomingDueDates = rows
      .map((row) => row.schedule?.due)
      .filter((due): due is string => due !== undefined && new Date(due) >= dayBoundary)
      .sort();
    const dueNow = rows.some((row) => row.schedule === null || new Date(row.schedule.due) < dayBoundary);
    return { ...notion, reps, nextDueDate: upcomingDueDates[0] ?? null, dueNow };
  });
}
