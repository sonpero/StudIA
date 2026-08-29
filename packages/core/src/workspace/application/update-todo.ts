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
}

export async function updateTodo(deps: UpdateTodoDeps, userId: string, id: string, patch: UpdateTodoPatch): Promise<Result<Todo, "not-found">> {
  const updated = await deps.repo.updateTodo(userId, id, patch);
  if (!updated) return err("not-found");
  return ok(updated);
}
