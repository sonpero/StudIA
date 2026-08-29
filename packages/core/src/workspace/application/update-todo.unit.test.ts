import { describe, expect, it } from "vitest";
import { fakeTodoRepository } from "./fakes.js";
import { updateTodo } from "./update-todo.js";

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

describe("updateTodo", () => {
  it("patches the given fields and returns the updated todo", async () => {
    const repo = fakeTodoRepository({ todos: [aTodo] });

    const result = await updateTodo({ repo }, "u1", "t1", { label: "Nouveau libellé", dueDate: "2026-03-10" });

    expect(result).toEqual({ ok: true, value: { ...aTodo, label: "Nouveau libellé", dueDate: "2026-03-10" } });
  });

  it("returns Err('not-found') for a todo belonging to another user", async () => {
    const repo = fakeTodoRepository({ todos: [aTodo] });

    const result = await updateTodo({ repo }, "u2", "t1", { label: "x" });

    expect(result).toEqual({ ok: false, error: "not-found" });
  });
});
