import type { TodoRepository } from "../domain/ports.js";
import type { Todo } from "../domain/types.js";

// In-memory test double for workspace's own port (CLAUDE.md rule 3), same
// shape as progress/application/fakes.ts's fakeProgressRepository.
export function fakeTodoRepository(seed: { todos?: Todo[] } = {}): TodoRepository & { todos: Todo[] } {
  const todos = [...(seed.todos ?? [])];

  return {
    todos,
    createTodo: (todo) => {
      todos.push(todo);
      return Promise.resolve();
    },
    listTodos: (userId) => Promise.resolve(todos.filter((t) => t.userId === userId)),
    updateTodo: (userId, id, patch) => {
      const index = todos.findIndex((t) => t.id === id && t.userId === userId);
      if (index === -1) return Promise.resolve(null);
      todos[index] = { ...todos[index]!, ...patch };
      return Promise.resolve(todos[index]);
    },
    deleteTodo: (userId, id) => {
      const index = todos.findIndex((t) => t.id === id && t.userId === userId);
      if (index === -1) return Promise.resolve(false);
      todos.splice(index, 1);
      return Promise.resolve(true);
    },
  };
}
