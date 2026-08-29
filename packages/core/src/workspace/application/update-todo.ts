import { err, ok, type Result } from "../../shared/index.js";
import type { TodoRepository } from "../domain/ports.js";
import type { Todo } from "../domain/types.js";

export interface UpdateTodoDeps {
  repo: TodoRepository;
}

export interface UpdateTodoPatch {
  label?: string;
  dueDate?: string | null;
  documentId?: string | null;
  done?: boolean;
}

// Covers both the "edit" and "check off" use cases from docs/modules/
// workspace.md: done is just one more optional field here, not a separate
// toggleTodo function. An earlier version split them and had the route
// dispatch on whether the body contained `done`, silently dropping any
// other field sent alongside it — a real defect, not a hypothetical one
// (apps/api/src/routes/workspace.int.test.ts's "applies every field in the
// body, done combined with a label edit, in one call"). Every field
// present in the patch is applied, in one repository call, always.
export async function updateTodo(deps: UpdateTodoDeps, userId: string, id: string, patch: UpdateTodoPatch): Promise<Result<Todo, "not-found">> {
  const updated = await deps.repo.updateTodo(userId, id, patch);
  if (!updated) return err("not-found");
  return ok(updated);
}
