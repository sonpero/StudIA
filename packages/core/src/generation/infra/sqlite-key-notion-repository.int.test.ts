import { sql } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { freshDb, type Db } from "../../../../../tests/support/db.js";
import type { Card, KeyNotion } from "../domain/types.js";
import { SqliteKeyNotionRepository } from "./sqlite-key-notion-repository.js";

const now = new Date("2026-01-01T00:00:00.000Z");

function seedUser(db: Db, id: string): void {
  db.run(sql`INSERT INTO users (id, username, password_hash, session_version, created_at)
      VALUES (${id}, ${`user-${id}`}, 'x', 1, ${now.toISOString()})`);
}

function seedDocument(db: Db, id: string, userId: string): void {
  db.run(sql`INSERT INTO documents (id, user_id, title, source_type, status, colour, created_at)
      VALUES (${id}, ${userId}, 'Cours', 'photo', 'done', '#F87171', ${now.toISOString()})`);
}

function seedNotion(db: Db, id: string, documentId: string, userId: string, position: number): void {
  db.run(sql`INSERT INTO notions (id, document_id, user_id, title, body, difficulty, position, created_at)
      VALUES (${id}, ${documentId}, ${userId}, ${`Notion ${id}`}, 'Corps.', 'medium', ${position}, ${now.toISOString()})`);
}

function aKeyNotion(overrides: Partial<KeyNotion> = {}): KeyNotion {
  return {
    id: "k1",
    documentId: "doc-1",
    userId: "u1",
    title: "Notion clé",
    summary: "Résumé court.",
    importance: "essential",
    isSynthesis: false,
    section: "1. Introduction",
    position: 0,
    readingNotionIds: ["n1"],
    createdAt: now.toISOString(),
    ...overrides,
  };
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

describe("SqliteKeyNotionRepository", () => {
  let cleanup: (() => void) | undefined;
  afterEach(() => cleanup?.());

  function setup() {
    const fresh = freshDb();
    cleanup = fresh.cleanup;
    const { db } = fresh;
    seedUser(db, "u1");
    seedUser(db, "u2");
    seedDocument(db, "doc-1", "u1");
    seedDocument(db, "doc-2", "u2");
    seedNotion(db, "n1", "doc-1", "u1", 0);
    seedNotion(db, "n2", "doc-1", "u1", 1);
    seedNotion(db, "n3", "doc-1", "u1", 2);
    seedNotion(db, "m1", "doc-2", "u2", 0);
    return { db, repo: new SqliteKeyNotionRepository(db) };
  }

  it("saves key notions with their sources and lists them by position, sources in course order", async () => {
    const { repo } = setup();
    await repo.saveKeyNotions("u1", [
      aKeyNotion({ id: "k2", position: 1, title: "Deuxième", importance: "important", isSynthesis: true, readingNotionIds: ["n3", "n1"] }),
      aKeyNotion({ id: "k1", position: 0, title: "Première", readingNotionIds: ["n2"] }),
    ]);

    const listed = await repo.listKeyNotions("u1", "doc-1");

    expect(listed.map((k) => k.id)).toEqual(["k1", "k2"]);
    expect(listed[1]).toEqual(
      aKeyNotion({ id: "k2", position: 1, title: "Deuxième", importance: "important", isSynthesis: true, readingNotionIds: ["n1", "n3"] }),
    );
  });

  it("never lists another user's key notions", async () => {
    const { repo } = setup();
    await repo.saveKeyNotions("u2", [aKeyNotion({ id: "k-other", documentId: "doc-2", userId: "u2", readingNotionIds: ["m1"] })]);

    expect(await repo.listKeyNotions("u1", "doc-2")).toEqual([]);
    expect(await repo.listKeyNotions("u2", "doc-2")).toHaveLength(1);
  });

  it("refuses a key notion whose user does not own the save, and writes nothing", async () => {
    const { repo } = setup();
    await expect(repo.saveKeyNotions("u1", [aKeyNotion({ id: "k-bad", documentId: "doc-2", userId: "u2", readingNotionIds: ["m1"] })])).rejects.toThrow();
    expect(await repo.listKeyNotions("u2", "doc-2")).toEqual([]);
  });

  it("is all or nothing: a source pointing to an unknown notion rolls the whole save back", async () => {
    const { repo } = setup();
    await expect(
      repo.saveKeyNotions("u1", [aKeyNotion({ id: "k1" }), aKeyNotion({ id: "k2", position: 1, readingNotionIds: ["no-such-notion"] })]),
    ).rejects.toThrow();
    expect(await repo.listKeyNotions("u1", "doc-1")).toEqual([]);
  });

  it("counts every card of the course, scoped by user, whichever flow created it", async () => {
    const { db, repo } = setup();
    db.run(sql`INSERT INTO cards (id, notion_id, user_id, type, state, question, answer, options_json, created_at)
        VALUES ('legacy', 'n2', 'u1', 'flashcard', 'active', 'Q ?', 'R', NULL, ${now.toISOString()})`);
    db.run(sql`INSERT INTO cards (id, notion_id, user_id, type, state, question, answer, options_json, created_at)
        VALUES ('other-user', 'm1', 'u2', 'flashcard', 'active', 'Q ?', 'R', NULL, ${now.toISOString()})`);

    expect(await repo.countCardsForDocument("u1", "doc-1")).toBe(1);
    expect(await repo.countCardsForDocument("u1", "doc-2")).toBe(0);
  });

  it("saves course cards with their key-notion links in one write", async () => {
    const { db, repo } = setup();
    await repo.saveKeyNotions("u1", [aKeyNotion({ id: "k1" })]);
    await repo.saveCourseCards(
      "u1",
      [aCard({ id: "c1" }), aCard({ id: "c2", type: "mcq", question: "QCM ?", answer: "A", options: ["A", "B", "C", "D"] })],
      [
        { cardId: "c1", keyNotionId: "k1" },
        { cardId: "c2", keyNotionId: "k1" },
      ],
    );

    expect(await repo.countCardsForDocument("u1", "doc-1")).toBe(2);
    expect(db.all(sql`SELECT card_id, key_notion_id FROM key_notion_cards ORDER BY card_id`)).toEqual([
      { card_id: "c1", key_notion_id: "k1" },
      { card_id: "c2", key_notion_id: "k1" },
    ]);
    expect(db.all(sql`SELECT options_json FROM cards WHERE id = 'c2'`)).toEqual([{ options_json: '["A","B","C","D"]' }]);
  });

  it("is all or nothing for cards: a link to an unknown key notion leaves no card behind", async () => {
    const { repo } = setup();
    await expect(repo.saveCourseCards("u1", [aCard({ id: "c1" })], [{ cardId: "c1", keyNotionId: "no-such-key-notion" }])).rejects.toThrow();
    expect(await repo.countCardsForDocument("u1", "doc-1")).toBe(0);
  });

  it("refuses to save a card belonging to another user", async () => {
    const { repo } = setup();
    await expect(repo.saveCourseCards("u1", [aCard({ id: "c1", userId: "u2", notionId: "m1" })], [])).rejects.toThrow();
  });

  it("deleting a reading notion removes its source rows and its cards' links, never the key notion itself", async () => {
    const { db, repo } = setup();
    await repo.saveKeyNotions("u1", [aKeyNotion({ id: "k1", readingNotionIds: ["n1", "n2"] })]);
    await repo.saveCourseCards("u1", [aCard({ id: "c1", notionId: "n1" })], [{ cardId: "c1", keyNotionId: "k1" }]);

    db.run(sql`DELETE FROM notions WHERE id = 'n1'`);

    const [keyNotion] = await repo.listKeyNotions("u1", "doc-1");
    expect(keyNotion?.readingNotionIds).toEqual(["n2"]);
    expect(db.all(sql`SELECT card_id FROM key_notion_cards`)).toEqual([]);
  });

  it("deleting the document removes its key notions and their rows", async () => {
    const { db, repo } = setup();
    await repo.saveKeyNotions("u1", [aKeyNotion({ id: "k1" })]);

    db.run(sql`DELETE FROM cards`);
    db.run(sql`DELETE FROM notions WHERE document_id = 'doc-1'`);
    db.run(sql`DELETE FROM documents WHERE id = 'doc-1'`);

    expect(db.all(sql`SELECT id FROM key_notions`)).toEqual([]);
    expect(db.all(sql`SELECT key_notion_id FROM key_notion_sources`)).toEqual([]);
  });

  it("rejects an importance outside essential/important at the database level", () => {
    const { db } = setup();
    expect(() =>
      db.run(sql`INSERT INTO key_notions (id, document_id, user_id, title, summary, importance, is_synthesis, section, position, created_at)
          VALUES ('k9', 'doc-1', 'u1', 'T', 'S', 'secondary', 0, 'S1', 9, ${now.toISOString()})`),
    ).toThrow();
  });
});
