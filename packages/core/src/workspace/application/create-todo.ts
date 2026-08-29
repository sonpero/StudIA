import type { IdGenerator } from "../../shared/index.js";
import type { TodoRepository } from "../domain/ports.js";
import type { Todo } from "../domain/types.js";

export interface CreateTodoDeps {
  repo: TodoRepository;
  idGenerator: IdGenerator;
}

export interface CreateTodoInput {
  label: string;
  dueDate?: string | null;
  documentId?: string | null;
}

// Always source: 'manual' — a photo-sourced todo is created by confirming
// a proposal (docs/modules/workspace.md, step 3), a different path that
// does not call this function. label's non-emptiness is a route-level Zod
// concern (CLAUDE.md: validate at the boundary), not repeated here.
export async function createTodo(deps: CreateTodoDeps, userId: string, input: CreateTodoInput, now: Date): Promise<Todo> {
  const todo: Todo = {
    id: deps.idGenerator.next(),
    userId,
    label: input.label,
    dueDate: input.dueDate ?? null,
    documentId: input.documentId ?? null,
    done: false,
    source: "manual",
    createdAt: now.toISOString(),
  };
  await deps.repo.createTodo(todo);
  return todo;
}
