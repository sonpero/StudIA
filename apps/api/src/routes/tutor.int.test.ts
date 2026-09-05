import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Argon2PasswordHasher, createOrResetAccount, SqliteUserRepository, uuidV7Generator } from "@studia/core";
import { sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../app.js";
import { openDatabase } from "../db/connection.js";
import { runMigrations } from "../db/migrate.js";

function extractCookie(setCookieHeader: string | string[] | undefined): string {
  const raw = Array.isArray(setCookieHeader) ? setCookieHeader[0] : setCookieHeader;
  if (!raw) throw new Error("expected a Set-Cookie header");
  const match = /^([^=]+)=([^;]+)/.exec(raw);
  if (!match) throw new Error(`could not parse Set-Cookie header: ${raw}`);
  return `${match[1]}=${match[2]}`;
}

// Same two-real-paragraphs shape as tutor's own ask.unit.test.ts: splits
// into exactly two sections, both in range for FixtureCitationExtractor's
// "valid" case (sectionIndexes: [0, 1]).
const MARKDOWN =
  "# Titre\n\n" +
  "Un premier paragraphe de cours assez long pour dépasser le seuil de quatre-vingts caractères sans aucun souci ici.\n\n" +
  "Un second paragraphe de cours, également assez long pour dépasser ce même seuil sans aucun problème non plus.";

type SseEvent = { event: string; data: unknown };

function parseSse(payload: string): SseEvent[] {
  return payload
    .split("\n\n")
    .filter((block) => block.trim() !== "")
    .map((block) => {
      const eventLine = block.split("\n").find((line) => line.startsWith("event: "));
      const dataLine = block.split("\n").find((line) => line.startsWith("data: "));
      return { event: eventLine?.slice("event: ".length) ?? "", data: JSON.parse(dataLine?.slice("data: ".length) ?? "null") as unknown };
    });
}

const now = new Date("2026-01-01T00:00:00.000Z");

describe("tutor routes", () => {
  let dir: string;
  let app: ReturnType<typeof buildApp>;
  let aliceCookie: string;
  let bobCookie: string;

  beforeEach(async () => {
    dir = mkdtempSync(path.join(tmpdir(), "studia-api-tutor-"));
    const dbPath = path.join(dir, "test.db");
    const seedDb = openDatabase(dbPath);
    runMigrations(seedDb);
    const identityDeps = { userRepository: new SqliteUserRepository(seedDb), passwordHasher: new Argon2PasswordHasher(), idGenerator: uuidV7Generator };
    await createOrResetAccount(identityDeps, "alice", "alice-pass", now);
    await createOrResetAccount(identityDeps, "bob", "bob-pass", now);

    seedDb.run(sql`INSERT INTO documents (id, user_id, title, source_type, status, colour, created_at)
        VALUES ('doc-1', (SELECT id FROM users WHERE username='alice'), 'Cours', 'photo', 'done', '#F87171', ${now.toISOString()})`);
    seedDb.run(sql`INSERT INTO extractions (document_id, markdown, extracted_at)
        VALUES ('doc-1', ${MARKDOWN}, ${now.toISOString()})`);
    seedDb.run(sql`INSERT INTO documents (id, user_id, title, source_type, status, colour, created_at)
        VALUES ('doc-running', (SELECT id FROM users WHERE username='alice'), 'Cours en cours', 'photo', 'running', '#F87171', ${now.toISOString()})`);

    app = buildApp({ databasePath: dbPath, dataDir: dir, sessionSecret: "test-session-secret", cookieSecure: false, llmAdapter: "fixture" });
    const aliceLogin = await app.inject({ method: "POST", url: "/api/auth/login", payload: { username: "alice", password: "alice-pass" } });
    aliceCookie = extractCookie(aliceLogin.headers["set-cookie"]);
    const bobLogin = await app.inject({ method: "POST", url: "/api/auth/login", payload: { username: "bob", password: "bob-pass" } });
    bobCookie = extractCookie(bobLogin.headers["set-cookie"]);
  });

  afterEach(async () => {
    await app.close();
    rmSync(dir, { recursive: true, force: true });
  });

  async function startConversation(cookie: string, documentId = "doc-1") {
    const res = await app.inject({ method: "POST", url: `/api/documents/${documentId}/conversations`, headers: { cookie } });
    return res;
  }

  it("POST /api/documents/:id/conversations starts a conversation with no title yet (201)", async () => {
    const res = await startConversation(aliceCookie);

    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ documentId: "doc-1", title: null });
  });

  it("POST /api/documents/:id/conversations requires authentication (401)", async () => {
    const res = await app.inject({ method: "POST", url: "/api/documents/doc-1/conversations" });
    expect(res.statusCode).toBe(401);
  });

  it("POST /api/documents/:id/conversations rejects a document owned by someone else (403)", async () => {
    const res = await startConversation(bobCookie);
    expect(res.statusCode).toBe(403);
  });

  it("GET /api/conversations/:id returns the conversation and its history, scoped to the owner (403 otherwise)", async () => {
    const conversation = (await startConversation(aliceCookie)).json<{ id: string }>();

    const owner = await app.inject({ method: "GET", url: `/api/conversations/${conversation.id}`, headers: { cookie: aliceCookie } });
    expect(owner.statusCode).toBe(200);
    expect(owner.json()).toMatchObject({ conversation: { id: conversation.id }, messages: [] });

    const other = await app.inject({ method: "GET", url: `/api/conversations/${conversation.id}`, headers: { cookie: bobCookie } });
    expect(other.statusCode).toBe(403);
  });

  it("DELETE /api/conversations/:id removes the owner's conversation (204), 403 for anyone else", async () => {
    const conversation = (await startConversation(aliceCookie)).json<{ id: string }>();

    const stolen = await app.inject({ method: "DELETE", url: `/api/conversations/${conversation.id}`, headers: { cookie: bobCookie } });
    expect(stolen.statusCode).toBe(403);

    const deleted = await app.inject({ method: "DELETE", url: `/api/conversations/${conversation.id}`, headers: { cookie: aliceCookie } });
    expect(deleted.statusCode).toBe(204);

    const after = await app.inject({ method: "GET", url: `/api/conversations/${conversation.id}`, headers: { cookie: aliceCookie } });
    expect(after.statusCode).toBe(403);
  });

  it("POST /api/conversations/:id/messages rejects an empty question (400)", async () => {
    const conversation = (await startConversation(aliceCookie)).json<{ id: string }>();

    const res = await app.inject({
      method: "POST",
      url: `/api/conversations/${conversation.id}/messages`,
      headers: { cookie: aliceCookie },
      payload: { question: "" },
    });

    expect(res.statusCode).toBe(400);
  });

  it("POST /api/conversations/:id/messages refuses another user's conversation (403), without streaming anything", async () => {
    const conversation = (await startConversation(aliceCookie)).json<{ id: string }>();

    const res = await app.inject({
      method: "POST",
      url: `/api/conversations/${conversation.id}/messages`,
      headers: { cookie: bobCookie },
      payload: { question: "Une question ?" },
    });

    expect(res.statusCode).toBe(403);
  });

  it("POST /api/conversations/:id/messages refuses a document that is not ready yet (409)", async () => {
    const conversation = (await startConversation(aliceCookie, "doc-running")).json<{ id: string }>();

    const res = await app.inject({
      method: "POST",
      url: `/api/conversations/${conversation.id}/messages`,
      headers: { cookie: aliceCookie },
      payload: { question: "Une question ?" },
    });

    expect(res.statusCode).toBe(409);
  });

  it("POST /api/conversations/:id/messages streams chunks then a done event with citations, and persists both messages", async () => {
    const conversation = (await startConversation(aliceCookie)).json<{ id: string }>();

    const res = await app.inject({
      method: "POST",
      url: `/api/conversations/${conversation.id}/messages`,
      headers: { cookie: aliceCookie },
      payload: { question: "Explique-moi le titre." },
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("text/event-stream");

    const events = parseSse(res.payload);
    const chunkEvents = events.filter((e) => e.event === "chunk");
    const doneEvents = events.filter((e) => e.event === "done");

    expect(chunkEvents.length).toBeGreaterThan(1);
    expect(doneEvents).toHaveLength(1);
    const done = doneEvents[0]?.data as { citations: { text: string }[]; grounded: boolean };
    expect(done.grounded).toBe(true);
    expect(done.citations.length).toBeGreaterThan(0);

    const history = await app.inject({ method: "GET", url: `/api/conversations/${conversation.id}`, headers: { cookie: aliceCookie } });
    const historyBody = history.json<{ conversation: { title: string | null }; messages: { role: string; partial: boolean }[] }>();
    expect(historyBody.conversation.title).toBe("Explique-moi le titre.");
    expect(historyBody.messages).toHaveLength(2);
    expect(historyBody.messages[0]).toMatchObject({ role: "user", partial: false });
    expect(historyBody.messages[1]).toMatchObject({ role: "assistant", partial: false });
  });

  // Not a red-then-green cycle: this locks in a guarantee ask.ts's slicing
  // (packages/core/src/tutor/application/ask.ts) already provides -- server
  // code is unchanged by the frontend markdown-rendering work this test
  // accompanies, so it is expected to pass on its own from the start.
  // Written now, explicitly, so a later change to the display layer -- the
  // only thing that pass is actually meant to touch -- cannot silently
  // start mutating citation.text itself instead of just how it renders
  // (docs/UI.md's Tuteur note: "the underlying string is untouched by
  // that").
  it("citation.text is always an exact substring of the course's own source markdown, on the wire and in the database", async () => {
    const conversation = (await startConversation(aliceCookie)).json<{ id: string }>();

    const res = await app.inject({
      method: "POST",
      url: `/api/conversations/${conversation.id}/messages`,
      headers: { cookie: aliceCookie },
      payload: { question: "Explique-moi le titre." },
    });

    const events = parseSse(res.payload);
    const done = events.find((e) => e.event === "done")!;
    const citationsOnTheWire = (done.data as { citations: { text: string }[] }).citations;
    expect(citationsOnTheWire.length).toBeGreaterThan(0);
    for (const citation of citationsOnTheWire) {
      expect(MARKDOWN).toContain(citation.text);
    }

    const history = await app.inject({ method: "GET", url: `/api/conversations/${conversation.id}`, headers: { cookie: aliceCookie } });
    const messages = history.json<{ messages: { role: string; citations: { text: string }[] | null }[] }>().messages;
    const assistantMessage = messages.find((m) => m.role === "assistant")!;
    expect(assistantMessage.citations).not.toBeNull();
    expect(assistantMessage.citations!.length).toBeGreaterThan(0);
    for (const citation of assistantMessage.citations!) {
      expect(MARKDOWN).toContain(citation.text);
    }
  });
});
