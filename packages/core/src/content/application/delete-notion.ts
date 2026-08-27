import { err, ok, type Result } from "../../shared/index.js";
import { renumberContiguously } from "../domain/position.js";
import type { NotionRepository } from "../domain/ports.js";

export interface DeleteNotionDeps {
  repo: NotionRepository;
}

// Deleting a notion renumbers positions (docs/modules/content.md). Cards
// cascade automatically via ON DELETE CASCADE on cards.notion_id
// (docs/modules/generation.md) — content does not need to call into
// generation for a delete, only for an edit (updateNotion, markStale).
export async function deleteNotion(deps: DeleteNotionDeps, userId: string, notionId: string): Promise<Result<void, "not-found">> {
  const deleted = await deps.repo.deleteNotion(userId, notionId);
  if (!deleted) return err("not-found");

  const survivors = await deps.repo.listNotions(userId, deleted.documentId);
  await deps.repo.reorderNotions(userId, deleted.documentId, renumberContiguously(survivors.map((n) => n.id)));
  return ok(undefined);
}
