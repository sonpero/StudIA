export type { Todo } from "./domain/types.js";
export type { TodoRepository } from "./domain/ports.js";

export { createTodo, type CreateTodoDeps, type CreateTodoInput } from "./application/create-todo.js";
export { updateTodo, type UpdateTodoDeps, type UpdateTodoPatch } from "./application/update-todo.js";
export { deleteTodo, type DeleteTodoDeps } from "./application/delete-todo.js";

export { SqliteTodoRepository, type WorkspaceDb } from "./infra/sqlite-todo-repository.js";
// For apps/api/drizzle.config.ts's glob (same reason as every other module).
export { todosTable } from "./infra/schema.js";
