import { err, ok, type Result } from "../../shared/index.js";
import { renumberContiguously } from "../domain/position.js";
import { validateReorder, type ReorderError } from "../domain/validate-reorder.js";
import type { NotionRepository } from "../domain/ports.js";

export interface ReorderNotionsDeps {
  repo: NotionRepository;
}

// Rejects a partial list (docs/modules/content.md). Positions are assigned
// by validate-reorder.ts + position.ts, both pure; this use case only wires
// them to the repository, which is responsible for writing them without
// tripping UNIQUE(document_id, position) mid-update (docs/modules/content.md:
// shift into a negative range first, then back).
export async function reorderNotions(
  deps: ReorderNotionsDeps,
  userId: string,
  documentId: string,
  orderedIds: string[],
): Promise<Result<void, ReorderError>> {
  const current = await deps.repo.listNotions(userId, documentId);
  const validated = validateReorder(
    current.map((n) => n.id),
    orderedIds,
  );
  if (!validated.ok) return err(validated.error);

  await deps.repo.reorderNotions(userId, documentId, renumberContiguously(validated.value));
  return ok(undefined);
}
