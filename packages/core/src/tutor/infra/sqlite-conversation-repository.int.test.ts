import { sql } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { freshDb, type Db } from "../../../../../tests/support/db.js";
import type { Conversation, Message } from "../domain/types.js";
import { SqliteConversationRepository } from "./sqlite-conversation-repository.js";

const now = new Date("2026-01-01T00:00:00.000Z");

function seedUser(db: Db, id: string): void {
  db.run(sql`INSERT INTO users (id, username, password_hash, session_version, created_at)
      VALUES (${id}, ${`user-${id}`}, 'x', 1, ${now.toISOString()})`);
}

function seedDocument(db: Db, id: string, userId: string): void {
  db.run(sql`INSERT INTO documents (id, user_id, title, source_type, status, colour, created_at)
      VALUES (${id}, ${userId}, 'Cours', 'photo', 'done', '#F87171', ${now.toISOString()})`);
}

function aConversation(overrides: Partial<Conversation> = {}): Conversation {
  return { id: "c1", userId: "u1", documentId: "doc-1", title: null, createdAt: now.toISOString(), ...overrides };
}

function aMessage(overrides: Partial<Message> = {}): Message {
  return {
    id: "m1",
    conversationId: "c1",
    role: "user",
    content: "Une question ?",
    citations: null,
    partial: false,
    createdAt: now.toISOString(),
    ...overrides,
  };
}

describe("SqliteConversationRepository", () => {
  let cleanup: (() => void) | undefined;
  afterEach(() => cleanup?.());

  function setup() {
    const { db, cleanup: c } = freshDb();
    cleanup = c;
    seedUser(db, "u1");
    seedUser(db, "u2");
    seedDocument(db, "doc-1", "u1");
    return { db, repo: new SqliteConversationRepository(db) };
  }

  it("createConversation writes a row, and findConversation reads it back only for the owner", async () => {
    const { repo } = setup();

    await repo.createConversation("u1", "doc-1", aConversation());

    expect(await repo.findConversation("u1", "c1")).toEqual(aConversation());
    expect(await repo.findConversation("u2", "c1")).toBeNull();
  });

  it("listConversations scopes to the caller and the document", async () => {
    const { db, repo } = setup();
    seedDocument(db, "doc-2", "u1");
    await repo.createConversation("u1", "doc-1", aConversation({ id: "c1" }));
    await repo.createConversation("u1", "doc-2", aConversation({ id: "c2", documentId: "doc-2" }));
    await repo.createConversation("u2", "doc-1", aConversation({ id: "c3", userId: "u2" }));

    const conversations = await repo.listConversations("u1", "doc-1");

    expect(conversations.map((c) => c.id)).toEqual(["c1"]);
  });

  it("appendMessages writes both messages of an exchange, and listMessages returns them ordered, scoped to the owner", async () => {
    const { repo } = setup();
    await repo.createConversation("u1", "doc-1", aConversation());

    await repo.appendMessages("u1", "c1", [
      aMessage({ id: "m1", role: "user", content: "Une question ?" }),
      aMessage({ id: "m2", role: "assistant", content: "Une réponse.", citations: [{ text: "Passage cité." }] }),
    ]);

    const messages = await repo.listMessages("u1", "c1");
    expect(messages.map((m) => m.id)).toEqual(["m1", "m2"]);
    expect(messages[1]?.citations).toEqual([{ text: "Passage cité." }]);
    expect(await repo.listMessages("u2", "c1")).toEqual([]);
  });

  it("appendMessages does nothing for a conversation owned by someone else", async () => {
    const { repo } = setup();
    await repo.createConversation("u1", "doc-1", aConversation());

    await repo.appendMessages("u2", "c1", [aMessage()]);

    expect(await repo.listMessages("u1", "c1")).toEqual([]);
  });

  it("a partial message round-trips partial:true and citations:null", async () => {
    const { repo } = setup();
    await repo.createConversation("u1", "doc-1", aConversation());

    await repo.appendMessages("u1", "c1", [aMessage({ role: "assistant", content: "Réponse coupée", citations: null, partial: true })]);

    const [message] = await repo.listMessages("u1", "c1");
    expect(message?.partial).toBe(true);
    expect(message?.citations).toBeNull();
  });

  it("setConversationTitle updates only the caller's conversation", async () => {
    const { repo } = setup();
    await repo.createConversation("u1", "doc-1", aConversation());

    await repo.setConversationTitle("u2", "c1", "Titre volé");
    expect((await repo.findConversation("u1", "c1"))?.title).toBeNull();

    await repo.setConversationTitle("u1", "c1", "Vrai titre");
    expect((await repo.findConversation("u1", "c1"))?.title).toBe("Vrai titre");
  });

  it("deleteConversation removes only the owner's row and cascades to its messages", async () => {
    const { db, repo } = setup();
    await repo.createConversation("u1", "doc-1", aConversation());
    await repo.appendMessages("u1", "c1", [aMessage()]);

    await repo.deleteConversation("u2", "c1");
    expect(await repo.findConversation("u1", "c1")).not.toBeNull();

    await repo.deleteConversation("u1", "c1");
    expect(await repo.findConversation("u1", "c1")).toBeNull();
    expect(db.all(sql`SELECT * FROM messages WHERE conversation_id = 'c1'`)).toEqual([]);
  });

  it("deleting the parent document cascades to its conversations", async () => {
    const { db, repo } = setup();
    await repo.createConversation("u1", "doc-1", aConversation());

    db.run(sql`DELETE FROM documents WHERE id = 'doc-1'`);

    expect(await repo.findConversation("u1", "c1")).toBeNull();
  });

  it("rejects a message for a conversation that does not exist (FK enforced)", async () => {
    const { repo } = setup();
    await repo.createConversation("u1", "doc-1", aConversation());

    await expect(repo.appendMessages("u1", "c1", [aMessage({ conversationId: "ghost" })])).rejects.toThrow(/FOREIGN KEY/);
  });
});
