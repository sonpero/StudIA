import type { Todo } from "./types.js";

// Every method takes userId and filters on it (CLAUDE.md: "a repository
// method without userId in its signature is a bug"). updateTodo is the one
// method behind both the updateTodo and toggleTodo use cases (M6, step 1
// of docs/modules/workspace.md) — done is just one more optional field in
// the same patch, not a separate code path at the repository layer.
export interface TodoRepository {
  createTodo(todo: Todo): Promise<void>;
  listTodos(userId: string): Promise<Todo[]>;
  // Returns the updated row, or null if no todo with this id belongs to
  // this user (does not distinguish "does not exist" from "belongs to
  // someone else" — same convention as every other module's ownership
  // check).
  updateTodo(userId: string, id: string, patch: Partial<Pick<Todo, "label" | "dueDate" | "documentId" | "done">>): Promise<Todo | null>;
  // Returns false for the same two cases updateTodo returns null for.
  deleteTodo(userId: string, id: string): Promise<boolean>;
}
