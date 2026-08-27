import { err, ok, type Result } from "../../shared/index.js";

export type ReorderError = "partial-list";

// Rejects a partial list (docs/modules/content.md): the proposed order must
// be an exact permutation of the current ids — same set, same size, no
// duplicates, nothing foreign.
export function validateReorder(currentIds: string[], proposedOrder: string[]): Result<string[], ReorderError> {
  if (proposedOrder.length !== currentIds.length) return err("partial-list");

  const current = new Set(currentIds);
  const seen = new Set<string>();
  for (const id of proposedOrder) {
    if (!current.has(id) || seen.has(id)) return err("partial-list");
    seen.add(id);
  }

  return ok(proposedOrder);
}
