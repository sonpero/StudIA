import { sql } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { freshDb, type Db } from "../../../../../tests/support/db.js";
import type { Todo, TodoProposal } from "../domain/types.js";
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

function seedJob(db: Db, id: string, userId: string): void {
  db.run(sql`INSERT INTO jobs (id, user_id, type, payload_json, status, run_after, created_at, updated_at)
      VALUES (${id}, ${userId}, 'extract-todos', '{}', 'done', ${now.toISOString()}, ${now.toISOString()}, ${now.toISOString()})`);
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
    seedJob(db, "job-1", "u1");
    return { db, repo: new SqliteTodoRepository(db) };
  }

  function aProposal(overrides: Partial<TodoProposal> = {}): TodoProposal {
    return { id: "p1", jobId: "job-1", userId: "u1", label: "Rendre le devoir de maths", dueDate: "2026-03-10", subjectHint: "Maths", createdAt: now.toISOString(), ...overrides };
  }

  function rawTodosCount(db: Db): number {
    return db.all<{ n: number }>(sql`SELECT COUNT(*) as n FROM todos`)[0]!.n;
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

  // The central invariant of the photo-extraction step (docs/modules/
  // workspace.md): a proposal never reaches `todos` outside confirmProposals.
  // Written first, before any of these methods existed.
  it("a replaced proposal never appears in todos until confirmProposals is called", async () => {
    const { db, repo } = setup();

    await repo.replaceProposalsForJob("u1", "job-1", [aProposal()]);
    expect(rawTodosCount(db)).toBe(0);

    await repo.listProposals("u1", "job-1"); // reading proposals is not confirming them
    expect(rawTodosCount(db)).toBe(0);

    const todo: Todo = { id: "t1", userId: "u1", label: aProposal().label, dueDate: aProposal().dueDate, documentId: null, done: false, source: "photo", createdAt: now.toISOString() };
    await repo.confirmProposals("u1", "job-1", [todo]);

    expect(rawTodosCount(db)).toBe(1);
    expect(await repo.listTodos("u1")).toEqual([todo]);
  });

  it("replaceProposalsForJob deletes the job's existing proposals before inserting — idempotent on retry", async () => {
    const { repo } = setup();
    await repo.replaceProposalsForJob("u1", "job-1", [aProposal({ id: "p1" }), aProposal({ id: "p2", label: "Autre" })]);

    await repo.replaceProposalsForJob("u1", "job-1", [aProposal({ id: "p1" })]);

    expect(await repo.listProposals("u1", "job-1")).toEqual([aProposal({ id: "p1" })]);
  });

  it("listProposals is scoped to the owner", async () => {
    const { repo } = setup();
    await repo.replaceProposalsForJob("u1", "job-1", [aProposal()]);

    expect(await repo.listProposals("u2", "job-1")).toEqual([]);
  });

  it("confirmProposals deletes every proposal for the job, accepted or not", async () => {
    const { repo } = setup();
    await repo.replaceProposalsForJob("u1", "job-1", [aProposal({ id: "p1" }), aProposal({ id: "p2", label: "Non acceptée" })]);

    const todo: Todo = { id: "t1", userId: "u1", label: "Rendre le devoir de maths", dueDate: "2026-03-10", documentId: null, done: false, source: "photo", createdAt: now.toISOString() };
    await repo.confirmProposals("u1", "job-1", [todo]);

    expect(await repo.listProposals("u1", "job-1")).toEqual([]);
    expect(await repo.listTodos("u1")).toEqual([todo]);
  });

  it("confirmProposals with no accepted todos still deletes the proposals and creates nothing", async () => {
    const { repo } = setup();
    await repo.replaceProposalsForJob("u1", "job-1", [aProposal()]);

    await repo.confirmProposals("u1", "job-1", []);

    expect(await repo.listProposals("u1", "job-1")).toEqual([]);
    expect(await repo.listTodos("u1")).toEqual([]);
  });

  it("deleteProposals removes every proposal for the job and creates no todos", async () => {
    const { repo } = setup();
    await repo.replaceProposalsForJob("u1", "job-1", [aProposal()]);

    await repo.deleteProposals("u1", "job-1");

    expect(await repo.listProposals("u1", "job-1")).toEqual([]);
    expect(await repo.listTodos("u1")).toEqual([]);
  });
});
