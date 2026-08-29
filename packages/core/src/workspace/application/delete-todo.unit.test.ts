import { describe, expect, it } from "vitest";
import { deleteTodo } from "./delete-todo.js";
import { fakeTodoRepository } from "./fakes.js";

const aTodo = {
  id: "t1",
  userId: "u1",
  label: "Réviser",
  dueDate: null,
  documentId: null,
  done: false,
  source: "manual" as const,
  createdAt: "2026-03-01T00:00:00.000Z",
};

describe("deleteTodo", () => {
  it("removes the todo", async () => {
    const repo = fakeTodoRepository({ todos: [aTodo] });

    const result = await deleteTodo({ repo }, "u1", "t1");

    expect(result).toEqual({ ok: true, value: undefined });
    expect(repo.todos).toEqual([]);
  });

  it("returns Err('not-found') for a todo belonging to another user, and does not delete it", async () => {
    const repo = fakeTodoRepository({ todos: [aTodo] });

    const result = await deleteTodo({ repo }, "u2", "t1");

    expect(result).toEqual({ ok: false, error: "not-found" });
    expect(repo.todos).toEqual([aTodo]);
  });
});
