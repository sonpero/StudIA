import { sql } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { freshDb, type Db } from "../../../../../tests/support/db.js";
import type { Card } from "../domain/types.js";
import { SqliteCardRepository } from "./sqlite-card-repository.js";

const now = new Date("2026-01-01T00:00:00.000Z");

function seedUser(db: Db, id: string): void {
  db.run(sql`INSERT INTO users (id, username, password_hash, session_version, created_at)
      VALUES (${id}, ${`user-${id}`}, 'x', 1, ${now.toISOString()})`);
}

function seedDocument(db: Db, id: string, userId: string): void {
  db.run(sql`INSERT INTO documents (id, user_id, title, source_type, status, colour, created_at)
      VALUES (${id}, ${userId}, 'Cours', 'photo', 'done', '#F87171', ${now.toISOString()})`);
}

function seedNotion(db: Db, id: string, documentId: string, userId: string): void {
  db.run(sql`INSERT INTO notions (id, document_id, user_id, title, body, difficulty, position, created_at)
      VALUES (${id}, ${documentId}, ${userId}, 'Notion', 'Corps.', 'medium', 0, ${now.toISOString()})`);
}

function aCard(overrides: Partial<Card> = {}): Card {
  return {
    id: "c1",
    notionId: "n1",
    userId: "u1",
    type: "flashcard",
    state: "active",
    question: "Question ?",
    answer: "Réponse",
    options: null,
    createdAt: now.toISOString(),
    ...overrides,
  };
}

describe("SqliteCardRepository", () => {
  let cleanup: (() => void) | undefined;
  afterEach(() => cleanup?.());

  function setup() {
    const { db, cleanup: c } = freshDb();
    cleanup = c;
    seedUser(db, "u1");
    seedUser(db, "u2");
    seedDocument(db, "doc-1", "u1");
    seedNotion(db, "n1", "doc-1", "u1");
    return { db, repo: new SqliteCardRepository(db) };
  }

  it("applyCardChanges inserts new cards, and listCards returns them scoped to the owner", async () => {
    const { repo } = setup();

    await repo.applyCardChanges("u1", "n1", [aCard()], []);

    expect(await repo.listCards("u1", "n1")).toEqual([aCard()]);
    expect(await repo.listCards("u2", "n1")).toEqual([]);
  });

  it("applyCardChanges preserves mcq options as an array round-trip", async () => {
    const { repo } = setup();

    await repo.applyCardChanges("u1", "n1", [aCard({ id: "c-mcq", type: "mcq", options: ["A", "B", "C", "D"] })], []);

    const [card] = await repo.listCards("u1", "n1");
    expect(card?.options).toEqual(["A", "B", "C", "D"]);
  });

  it("applyCardChanges updates an existing id in place (upsert), preserving it for reviews", async () => {
    const { repo } = setup();
    await repo.applyCardChanges("u1", "n1", [aCard({ id: "c1", question: "Ancienne ?" })], []);

    await repo.applyCardChanges("u1", "n1", [aCard({ id: "c1", question: "Nouvelle ?" })], []);

    const cards = await repo.listCards("u1", "n1");
    expect(cards).toHaveLength(1);
    expect(cards[0]?.question).toBe("Nouvelle ?");
  });

  it("applyCardChanges deletes the given ids in the same call", async () => {
    const { repo } = setup();
    await repo.applyCardChanges("u1", "n1", [aCard({ id: "c1" }), aCard({ id: "c2" })], []);

    await repo.applyCardChanges("u1", "n1", [], ["c1"]);

    expect((await repo.listCards("u1", "n1")).map((c) => c.id)).toEqual(["c2"]);
  });

  it("findCard scopes to the owner", async () => {
    const { repo } = setup();
    await repo.applyCardChanges("u1", "n1", [aCard()], []);

    expect(await repo.findCard("u2", "c1")).toBeNull();
    expect((await repo.findCard("u1", "c1"))?.id).toBe("c1");
  });

  it("deleteCard removes the row and returns true, or false for another user", async () => {
    const { repo } = setup();
    await repo.applyCardChanges("u1", "n1", [aCard()], []);

    expect(await repo.deleteCard("u2", "c1")).toBe(false);
    expect(await repo.deleteCard("u1", "c1")).toBe(true);
    expect(await repo.findCard("u1", "c1")).toBeNull();
  });

  it("markStale flips only the caller's active cards for that notion", async () => {
    const { repo } = setup();
    await repo.applyCardChanges("u1", "n1", [aCard({ id: "c1" }), aCard({ id: "c2", state: "stale" })], []);

    await repo.markStale("u1", "n1");

    const cards = await repo.listCards("u1", "n1");
    expect(cards.find((c) => c.id === "c1")?.state).toBe("stale");
    expect(cards.find((c) => c.id === "c2")?.state).toBe("stale");
  });

  it("deleting the parent notion cascades to its cards", async () => {
    const { db, repo } = setup();
    await repo.applyCardChanges("u1", "n1", [aCard()], []);

    db.run(sql`DELETE FROM notions WHERE id = 'n1'`);

    expect(await repo.findCard("u1", "c1")).toBeNull();
  });

  it("rejects a card for a notion that does not exist (FK enforced)", () => {
    const { repo } = setup();

    expect(() => repo.applyCardChanges("u1", "ghost-notion", [aCard({ notionId: "ghost-notion" })], [])).toThrow(/FOREIGN KEY/);
  });
});
