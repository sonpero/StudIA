import type { Notion } from "../../content/index.js";
import { projectRetrievability, type CardSchedule } from "../../review/index.js";
import type { ProgressNotion } from "../domain/types.js";

export type NotionCardRow = { notionId: string; cardId: string; schedule: CardSchedule | null };

// Shared by getCourseProgress (one document) and listProgress (every document,
// grouped first) so the notion/card assembly logic is written once
// (docs/modules/progress.md's Ports section). retrievability is computed
// here, at the application boundary — computeProgress itself never calls
// review.projectRetrievability or knows FSRS exists.
export function assembleProgressNotions(notions: Notion[], cardRows: NotionCardRow[], projectionDate: Date): ProgressNotion[] {
  const rowsByNotionId = new Map<string, NotionCardRow[]>();
  for (const row of cardRows) {
    const list = rowsByNotionId.get(row.notionId) ?? [];
    list.push(row);
    rowsByNotionId.set(row.notionId, list);
  }

  return notions.map((notion) => ({
    id: notion.id,
    createdAt: notion.createdAt,
    cards: (rowsByNotionId.get(notion.id) ?? []).map((row) => ({
      reviewed: row.schedule !== null,
      retrievability: row.schedule === null ? 0 : projectRetrievability(row.schedule, projectionDate),
    })),
  }));
}
