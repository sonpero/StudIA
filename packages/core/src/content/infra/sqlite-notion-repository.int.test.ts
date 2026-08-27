import { sql } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { freshDb, type Db } from "../../../../../tests/support/db.js";
import type { Notion } from "../domain/types.js";
import { SqliteNotionRepository } from "./sqlite-notion-repository.js";

const now = new Date("2026-01-01T00:00:00.000Z");

function seedUser(db: Db, id: string): void {
  db.run(sql`INSERT INTO users (id, username, password_hash, session_version, created_at)
      VALUES (${id}, ${`user-${id}`}, 'x', 1, ${now.toISOString()})`);
}

function seedDocument(db: Db, id: string, userId: string): void {
  db.run(sql`INSERT INTO documents (id, user_id, title, source_type, status, colour, created_at)
      VALUES (${id}, ${userId}, 'Cours', 'photo', 'done', '#F87171', ${now.toISOString()})`);
}

function aNotion(overrides: Partial<Notion> = {}): Notion {
  return {
    id: "n1",
    documentId: "doc-1",
    userId: "u1",
    title: "Photosynthèse",
    body: "La photosynthèse transforme la lumière en énergie chimique.",
    difficulty: "medium",
    position: 0,
    createdAt: now.toISOString(),
    ...overrides,
  };
}

describe("SqliteNotionRepository", () => {
  let cleanup: (() => void) | undefined;
  afterEach(() => cleanup?.());

  function setup() {
    const { db, cleanup: c } = freshDb();
    cleanup = c;
    seedUser(db, "u1");
    seedUser(db, "u2");
    seedDocument(db, "doc-1", "u1");
    return { db, repo: new SqliteNotionRepository(db) };
  }

  it("replaceNotionsForDocument writes a set, and listNotions returns it ordered by position", async () => {
    const { repo } = setup();

    await repo.replaceNotionsForDocument("u1", "doc-1", [aNotion({ id: "n2", position: 1 }), aNotion({ id: "n1", position: 0 })]);

    const listed = await repo.listNotions("u1", "doc-1");
    expect(listed.map((n) => n.id)).toEqual(["n1", "n2"]);
  });

  it("replaceNotionsForDocument is idempotent: calling it twice leaves exactly one set", async () => {
    const { repo } = setup();

    await repo.replaceNotionsForDocument("u1", "doc-1", [aNotion({ id: "n1" })]);
    await repo.replaceNotionsForDocument("u1", "doc-1", [aNotion({ id: "n2" })]);

    const listed = await repo.listNotions("u1", "doc-1");
    expect(listed.map((n) => n.id)).toEqual(["n2"]);
  });

  it("findNotion returns null for another user's notion", async () => {
    const { repo } = setup();
    await repo.replaceNotionsForDocument("u1", "doc-1", [aNotion()]);

    expect(await repo.findNotion("u2", "n1")).toBeNull();
    expect(await repo.findNotion("u1", "n1")).not.toBeNull();
  });

  it("updateNotion patches only the given fields, scoped to the owner", async () => {
    const { repo } = setup();
    await repo.replaceNotionsForDocument("u1", "doc-1", [aNotion()]);

    const updated = await repo.updateNotion("u1", "n1", { title: "Nouveau titre" });

    expect(updated?.title).toBe("Nouveau titre");
    expect(updated?.body).toBe(aNotion().body);
    expect(await repo.updateNotion("u2", "n1", { title: "Vol" })).toBeNull();
  });

  it("reorderNotions handles a full reversal without tripping the UNIQUE(document_id, position) constraint", async () => {
    const { repo } = setup();
    await repo.replaceNotionsForDocument("u1", "doc-1", [
      aNotion({ id: "a", position: 0 }),
      aNotion({ id: "b", position: 1 }),
      aNotion({ id: "c", position: 2 }),
    ]);

    await repo.reorderNotions("u1", "doc-1", [
      { id: "c", position: 0 },
      { id: "b", position: 1 },
      { id: "a", position: 2 },
    ]);

    const listed = await repo.listNotions("u1", "doc-1");
    expect(listed.map((n) => n.id)).toEqual(["c", "b", "a"]);
  });

  it("deleteNotion removes the row and returns it, or null for another user", async () => {
    const { repo } = setup();
    await repo.replaceNotionsForDocument("u1", "doc-1", [aNotion()]);

    expect(await repo.deleteNotion("u2", "n1")).toBeNull();
    const deleted = await repo.deleteNotion("u1", "n1");

    expect(deleted?.id).toBe("n1");
    expect(await repo.findNotion("u1", "n1")).toBeNull();
  });

  it("searchNotions finds a match by title or body, scoped to the caller, and finds nothing after delete", async () => {
    const { repo } = setup();
    await repo.replaceNotionsForDocument("u1", "doc-1", [aNotion()]);

    expect(await repo.searchNotions("u1", "photosynthèse")).toEqual([aNotion()]);
    expect(await repo.searchNotions("u2", "photosynthèse")).toEqual([]);

    await repo.deleteNotion("u1", "n1");

    expect(await repo.searchNotions("u1", "photosynthèse")).toEqual([]);
  });

  it("searchNotions reflects an update immediately (FTS index stays in sync via triggers)", async () => {
    const { repo } = setup();
    await repo.replaceNotionsForDocument("u1", "doc-1", [aNotion()]);

    await repo.updateNotion("u1", "n1", {
      title: "Respiration cellulaire",
      body: "La respiration cellulaire libère de l'énergie stockée dans le glucose.",
    });

    expect(await repo.searchNotions("u1", "photosynthèse")).toEqual([]);
    expect((await repo.searchNotions("u1", "respiration")).map((n) => n.id)).toEqual(["n1"]);
  });

  it("deleting the parent document cascades to its notions", async () => {
    const { db, repo } = setup();
    await repo.replaceNotionsForDocument("u1", "doc-1", [aNotion()]);

    db.run(sql`DELETE FROM documents WHERE id = 'doc-1'`);

    expect(await repo.findNotion("u1", "n1")).toBeNull();
  });

  it("rejects a notion for a document that does not exist (FK enforced)", () => {
    const { repo } = setup();

    expect(() => repo.replaceNotionsForDocument("u1", "ghost-doc", [aNotion({ documentId: "ghost-doc" })])).toThrow(
      /FOREIGN KEY/,
    );
  });
});
