import { err, ok, type Result } from "../../shared/index.js";
import type { TodoRepository } from "../domain/ports.js";
import type { Todo } from "../domain/types.js";

export interface ToggleTodoDeps {
  repo: TodoRepository;
}

// Sets done to the given target value (the client already renders the
// current state, so it always knows what it's toggling to) rather than
// reading-then-flipping server-side, which would need its own
// read-modify-write step for no benefit at this app's scale (CLAUDE.md:
// don't add complexity for a race condition that isn't a real scenario
// here — one user, their own checkbox).
export async function toggleTodo(deps: ToggleTodoDeps, userId: string, id: string, done: boolean): Promise<Result<Todo, "not-found">> {
  const updated = await deps.repo.updateTodo(userId, id, { done });
  if (!updated) return err("not-found");
  return ok(updated);
}
