import { err, ok, type Result } from "../../shared/index.js";
import { isValidTitle } from "../domain/is-valid-title.js";
import type { NotionRepository } from "../domain/ports.js";
import type { Difficulty, Notion } from "../domain/types.js";

export interface UpdateNotionDeps {
  repo: NotionRepository;
  // A notion whose body changes must mark its cards stale
  // (docs/modules/generation.md). Injected as a plain function — the
  // wiring layer (apps/api, apps/worker) supplies generation's markStale
  // partially applied to its own CardRepository — so this module's
  // application layer does not need to know generation's port shapes.
  markNotionStale: (userId: string, notionId: string) => Promise<void>;
}

export type UpdateNotionError = "not-found" | "invalid-title";

export interface UpdateNotionPatch {
  title?: string;
  body?: string;
  difficulty?: Difficulty;
}

// Editing a notion's body should mark its cards stale, per
// docs/modules/generation.md — wired once `generation` exists
// (packages/core/src/content/application/update-notion.unit.test.ts and
// generation's markStale are built in separate steps of the same M3 pass).
export async function updateNotion(
  deps: UpdateNotionDeps,
  userId: string,
  notionId: string,
  patch: UpdateNotionPatch,
): Promise<Result<Notion, UpdateNotionError>> {
  if (patch.title !== undefined && !isValidTitle(patch.title)) return err("invalid-title");

  const updated = await deps.repo.updateNotion(userId, notionId, patch);
  if (!updated) return err("not-found");

  if (patch.body !== undefined) await deps.markNotionStale(userId, notionId);

  return ok(updated);
}
