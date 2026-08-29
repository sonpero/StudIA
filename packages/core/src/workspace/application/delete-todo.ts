import { err, ok, type Result } from "../../shared/index.js";
import type { TodoRepository } from "../domain/ports.js";

export interface DeleteTodoDeps {
  repo: TodoRepository;
}

export async function deleteTodo(deps: DeleteTodoDeps, userId: string, id: string): Promise<Result<void, "not-found">> {
  const deleted = await deps.repo.deleteTodo(userId, id);
  if (!deleted) return err("not-found");
  return ok(undefined);
}
