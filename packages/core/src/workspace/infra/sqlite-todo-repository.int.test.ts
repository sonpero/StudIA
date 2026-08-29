import { sql } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { freshDb, type Db } from "../../../../../tests/support/db.js";
import type { Todo } from "../domain/types.js";
import { SqliteTodoRepository } from "./sqlite-todo-repository.js";

const now = new Date("2026-01-01T00:00:00.000Z");

function seedUser(db: Db, id: string): void {
  db.run(sql`INSERT INTO users (id, username, password_hash, session_version, created_at)
      VALUES (${id}, ${`user-${id}`}, 'x', 1, ${now.toISOString()})`);
}

function seedDocument(db: Db, id: string, userId: string): void {
  db.run(sql`INSERT INTO documents (id, user_id, title, source_type, status, colour, created_at)
      VALUES (${id}, ${userId}, 'Cours', 'photo', 'done', '#F87171', ${now.toISOString()})`);
}

function aTodo(overrides: Partial<Todo> = {}): Todo {
  return {
    id: "t1",
    userId: "u1",
    label: "Réviser le chapitre 3",
    dueDate: null,
    documentId: null,
    done: false,
    source: "manual",
    createdAt: now.toISOString(),
    ...overrides,
  };
}

describe("SqliteTodoRepository", () => {
  let cleanup: (() => void) | undefined;
  afterEach(() => cleanup?.());

  function setup() {
    const { db, cleanup: c } = freshDb();
    cleanup = c;
    seedUser(db, "u1");
    seedUser(db, "u2");
    seedDocument(db, "doc-1", "u1");
    return { db, repo: new SqliteTodoRepository(db) };
  }

  it("createTodo then listTodos round-trips, scoped to the owner", async () => {
    const { repo } = setup();
    await repo.createTodo(aTodo());
    await repo.createTodo(aTodo({ id: "t-other-user", userId: "u2" }));

    expect(await repo.listTodos("u1")).toEqual([aTodo()]);
  });

  it("listTodos returns every todo the user owns, in creation order", async () => {
    const { repo } = setup();
    await repo.createTodo(aTodo({ id: "t1", label: "Premier" }));
    await repo.createTodo(aTodo({ id: "t2", label: "Second" }));

    expect((await repo.listTodos("u1")).map((t) => t.label)).toEqual(["Premier", "Second"]);
  });

  it("createTodo accepts a documentId link", async () => {
    const { repo } = setup();
    await repo.createTodo(aTodo({ documentId: "doc-1" }));

    expect((await repo.listTodos("u1"))[0]?.documentId).toBe("doc-1");
  });

  it("updateTodo patches only the given fields and returns the updated row", async () => {
    const { repo } = setup();
    await repo.createTodo(aTodo());

    const updated = await repo.updateTodo("u1", "t1", { label: "Nouveau libellé" });

    expect(updated).toEqual(aTodo({ label: "Nouveau libellé" }));
    expect(await repo.listTodos("u1")).toEqual([aTodo({ label: "Nouveau libellé" })]);
  });

  it("updateTodo can set done to true", async () => {
    const { repo } = setup();
    await repo.createTodo(aTodo());

    const updated = await repo.updateTodo("u1", "t1", { done: true });

    expect(updated?.done).toBe(true);
  });

  it("updateTodo returns null for a todo belonging to another user", async () => {
    const { repo } = setup();
    await repo.createTodo(aTodo({ userId: "u2" }));

    expect(await repo.updateTodo("u1", "t1", { label: "x" })).toBeNull();
  });

  it("updateTodo returns null for a todo that does not exist", async () => {
    const { repo } = setup();
    expect(await repo.updateTodo("u1", "missing", { label: "x" })).toBeNull();
  });

  it("deleteTodo removes the row and returns true", async () => {
    const { repo } = setup();
    await repo.createTodo(aTodo());

    expect(await repo.deleteTodo("u1", "t1")).toBe(true);
    expect(await repo.listTodos("u1")).toEqual([]);
  });

  it("deleteTodo returns false for another user's todo, and does not delete it", async () => {
    const { repo } = setup();
    await repo.createTodo(aTodo({ userId: "u2" }));

    expect(await repo.deleteTodo("u1", "t1")).toBe(false);
    expect(await repo.listTodos("u2")).toEqual([aTodo({ userId: "u2" })]);
  });

  it("deleting the linked document sets documentId to null, not deleting the todo", async () => {
    const { db, repo } = setup();
    await repo.createTodo(aTodo({ documentId: "doc-1" }));

    db.run(sql`DELETE FROM documents WHERE id = 'doc-1'`);

    expect((await repo.listTodos("u1"))[0]?.documentId).toBeNull();
  });
});
