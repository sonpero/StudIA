import { sql } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { freshDb, type Db } from "../../../../../tests/support/db.js";
import { SqliteProgressRepository } from "./sqlite-progress-repository.js";

const now = new Date("2026-03-02T09:00:00.000Z");

function seedUser(db: Db, id: string): void {
  db.run(sql`INSERT INTO users (id, username, password_hash, session_version, created_at)
      VALUES (${id}, ${`user-${id}`}, 'x', 1, ${now.toISOString()})`);
}

function seedDocument(db: Db, id: string, userId: string): void {
  db.run(sql`INSERT INTO documents (id, user_id, title, source_type, status, colour, created_at)
      VALUES (${id}, ${userId}, 'Cours', 'photo', 'done', '#F87171', ${now.toISOString()})`);
}

describe("SqliteProgressRepository", () => {
  let cleanup: (() => void) | undefined;
  afterEach(() => cleanup?.());

  function setup() {
    const { db, cleanup: c } = freshDb();
    cleanup = c;
    seedUser(db, "u1");
    seedUser(db, "u2");
    seedDocument(db, "doc-1", "u1");
    seedDocument(db, "doc-2", "u1");
    return { db, repo: new SqliteProgressRepository(db) };
  }

  it("getDeadline returns null when none is set", async () => {
    const { repo } = setup();
    expect(await repo.getDeadline("u1", "doc-1")).toBeNull();
  });

  it("setDeadline creates a deadline, scoped by user and document", async () => {
    const { repo } = setup();
    await repo.setDeadline("u1", { id: "d1", documentId: "doc-1", userId: "u1", date: "2026-03-20", label: "Contrôle", createdAt: now.toISOString() });

    expect(await repo.getDeadline("u1", "doc-1")).toEqual({
      id: "d1",
      documentId: "doc-1",
      userId: "u1",
      date: "2026-03-20",
      label: "Contrôle",
      createdAt: now.toISOString(),
    });
    expect(await repo.getDeadline("u1", "doc-2")).toBeNull();
    expect(await repo.getDeadline("u2", "doc-1")).toBeNull();
  });

  it("setDeadline upserts by document: a second call replaces the first, same id", async () => {
    const { repo } = setup();
    await repo.setDeadline("u1", { id: "d1", documentId: "doc-1", userId: "u1", date: "2026-03-10", label: null, createdAt: now.toISOString() });
    await repo.setDeadline("u1", { id: "d1", documentId: "doc-1", userId: "u1", date: "2026-03-25", label: "Rattrapage", createdAt: now.toISOString() });

    const deadline = await repo.getDeadline("u1", "doc-1");
    expect(deadline?.date).toBe("2026-03-25");
    expect(deadline?.label).toBe("Rattrapage");
  });

  it("deleteDeadline removes only the targeted document's deadline", async () => {
    const { repo } = setup();
    await repo.setDeadline("u1", { id: "d1", documentId: "doc-1", userId: "u1", date: "2026-03-20", label: null, createdAt: now.toISOString() });
    await repo.setDeadline("u1", { id: "d2", documentId: "doc-2", userId: "u1", date: "2026-03-21", label: null, createdAt: now.toISOString() });

    await repo.deleteDeadline("u1", "doc-1");

    expect(await repo.getDeadline("u1", "doc-1")).toBeNull();
    expect(await repo.getDeadline("u1", "doc-2")).not.toBeNull();
  });
});
