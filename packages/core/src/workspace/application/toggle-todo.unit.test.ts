import { describe, expect, it } from "vitest";
import { fakeTodoRepository } from "./fakes.js";
import { toggleTodo } from "./toggle-todo.js";

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

describe("toggleTodo", () => {
  it("sets done to the given value and returns the updated todo", async () => {
    const repo = fakeTodoRepository({ todos: [aTodo] });

    const result = await toggleTodo({ repo }, "u1", "t1", true);

    expect(result).toEqual({ ok: true, value: { ...aTodo, done: true } });
  });

  it("sets done back to false", async () => {
    const repo = fakeTodoRepository({ todos: [{ ...aTodo, done: true }] });

    const result = await toggleTodo({ repo }, "u1", "t1", false);

    expect(result).toEqual({ ok: true, value: { ...aTodo, done: false } });
  });

  it("returns Err('not-found') for a todo belonging to another user", async () => {
    const repo = fakeTodoRepository({ todos: [aTodo] });

    const result = await toggleTodo({ repo }, "u2", "t1", true);

    expect(result).toEqual({ ok: false, error: "not-found" });
  });
});
