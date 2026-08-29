import { describe, expect, it } from "vitest";
import { createTodo } from "./create-todo.js";
import { fakeTodoRepository } from "./fakes.js";

const now = new Date("2026-03-01T09:00:00.000Z");

describe("createTodo", () => {
  it("creates a manual todo with a generated id, not done, at now", async () => {
    const repo = fakeTodoRepository();

    const todo = await createTodo({ repo, idGenerator: { next: () => "t1" } }, "u1", { label: "Réviser le chapitre 3" }, now);

    expect(todo).toEqual({
      id: "t1",
      userId: "u1",
      label: "Réviser le chapitre 3",
      dueDate: null,
      documentId: null,
      done: false,
      source: "manual",
      createdAt: now.toISOString(),
    });
    expect(repo.todos).toEqual([todo]);
  });

  it("accepts an optional dueDate and documentId", async () => {
    const repo = fakeTodoRepository();

    const todo = await createTodo({ repo, idGenerator: { next: () => "t1" } }, "u1", { label: "Réviser", dueDate: "2026-03-10", documentId: "doc-1" }, now);

    expect(todo.dueDate).toBe("2026-03-10");
    expect(todo.documentId).toBe("doc-1");
  });
});
