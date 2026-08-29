import type { Notion } from "../../content/index.js";
import { notionsBelowTarget, readinessProjectionDate } from "../domain/compute-progress.js";
import type { Deadline } from "../domain/ports.js";
import type { ProgressDeadlineInput } from "../domain/types.js";
import { assembleProgressNotions, type NotionCardRow } from "./assemble-progress-notions.js";

// Not yet implemented — a coupling point for docs/modules/workspace.md,
// shown for review in docs/modules/progress.md before it was written (M6).
// Does no I/O of its own: takes rows the caller (workspace's getToday)
// already fetched, exactly like assembleProgressNotions does, so composing
// it with anything else that needs the same rows can never duplicate a
// read the way a self-fetching version could — see docs/modules/
// progress.md's "Revised after review" note for the shape this replaced.
export function notionsBelowTargetForDocument(notions: Notion[], cardRows: NotionCardRow[], deadline: Deadline | null, now: Date): string[] {
  const deadlineInput: ProgressDeadlineInput | null = deadline === null ? null : { date: deadline.date, setAt: deadline.createdAt };
  const projectionDate = readinessProjectionDate(deadlineInput, now);
  const progressNotions = assembleProgressNotions(notions, cardRows, projectionDate);

  const result = notionsBelowTarget({ notions: progressNotions, deadline: deadlineInput, now });
  return result.ok ? result.value : [];
}
