// Proves "no LLM call inside a transaction" (CLAUDE.md rule 2,
// docs/MILESTONES.md's M3 acceptance criterion) empirically — same approach
// as content/application/handle-split-job.int.test.ts.
import Database from "better-sqlite3";
import { sql } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { freshDb, type Db } from "../../../../../tests/support/db.js";
import { ok, uuidV7Generator } from "../../shared/index.js";
import { SqliteNotionRepository } from "../../content/index.js";
import { SqliteCardRepository } from "../infra/sqlite-card-repository.js";
import type { CardGenerator } from "../domain/ports.js";
import { handleGenerationJob } from "./handle-generation-job.js";

const now = new Date("2026-01-01T00:00:00.000Z");

function seedUser(db: Db, id: string): void {
  db.run(sql`INSERT INTO users (id, username, password_hash, session_version, created_at)
      VALUES (${id}, ${`user-${id}`}, 'x', 1, ${now.toISOString()})`);
}

describe("handleGenerationJob does not hold a transaction open while the generator is in flight", () => {
  let cleanup: (() => void) | undefined;
  afterEach(() => cleanup?.());

  it("lets a concurrent connection write to the same database while the generator call is pending", async () => {
    const { db, path, cleanup: c } = freshDb();
    cleanup = c;
    seedUser(db, "u1");
    db.run(sql`INSERT INTO documents (id, user_id, title, source_type, status, colour, created_at)
        VALUES ('doc-1', 'u1', 'Cours', 'photo', 'done', '#F87171', ${now.toISOString()})`);
    db.run(sql`INSERT INTO notions (id, document_id, user_id, title, body, difficulty, position, created_at)
        VALUES ('n1', 'doc-1', 'u1', 'Notion', 'Corps.', 'medium', 0, ${now.toISOString()})`);

    const notionRepo = new SqliteNotionRepository(db);
    const cardRepo = new SqliteCardRepository(db);

    let releaseGenerator: (() => void) | undefined;
    const stillPending = new Promise<void>((resolve) => {
      releaseGenerator = resolve;
    });
    const slowGenerator: CardGenerator = {
      generate: () =>
        new Promise((resolve) => {
          void stillPending.then(() =>
            resolve(ok([{ type: "flashcard", question: "Question ?", answer: "Réponse", options: null }])),
          );
        }),
    };

    const jobPromise = handleGenerationJob(
      { cardRepo, notionRepo, generator: slowGenerator, idGenerator: uuidV7Generator },
      { notionId: "n1", types: ["flashcard"] },
      { jobId: "job-1", userId: "u1", attempt: 1, now },
    );

    // Independent connection to the SAME file: succeeds immediately only if
    // no transaction is held open around the (slow) generator call.
    const secondConnection = new Database(path);
    secondConnection.pragma("busy_timeout = 5000");
    secondConnection.prepare("INSERT INTO users (id, username, password_hash, session_version, created_at) VALUES (?, ?, ?, ?, ?)").run(
      "concurrent-user",
      "concurrent",
      "x",
      1,
      now.toISOString(),
    );
    secondConnection.close();

    releaseGenerator?.();
    const result = await jobPromise;

    expect(result).toEqual({ ok: true, value: undefined });
  });
});

describe("handleGenerationJob keeps other types' cards and their review history", () => {
  let cleanup: (() => void) | undefined;
  afterEach(() => cleanup?.());

  // Regression (2026-10-03 diagnosis): generating only mcq used to delete
  // the notion's flashcards, and the delete cascaded to their reviews.
  it("generating mcq leaves an existing flashcard, its schedule and its reviews in place", async () => {
    const { db, cleanup: c } = freshDb();
    cleanup = c;
    seedUser(db, "u1");
    db.run(sql`INSERT INTO documents (id, user_id, title, source_type, status, colour, created_at)
        VALUES ('doc-1', 'u1', 'Cours', 'photo', 'done', '#F87171', ${now.toISOString()})`);
    db.run(sql`INSERT INTO notions (id, document_id, user_id, title, body, difficulty, position, created_at)
        VALUES ('n1', 'doc-1', 'u1', 'Notion', 'Corps.', 'medium', 0, ${now.toISOString()})`);
    db.run(sql`INSERT INTO cards (id, notion_id, user_id, type, state, question, answer, options_json, created_at)
        VALUES ('fc-1', 'n1', 'u1', 'flashcard', 'active', 'Flashcard ?', 'Réponse', NULL, ${now.toISOString()})`);
    db.run(sql`INSERT INTO card_schedules (card_id, user_id, due, stability, difficulty, reps, lapses, last_reviewed_at)
        VALUES ('fc-1', 'u1', ${now.toISOString()}, 3.5, 5, 2, 0, ${now.toISOString()})`);
    db.run(sql`INSERT INTO reviews (id, card_id, user_id, rating, reviewed_at, elapsed_ms)
        VALUES ('r-1', 'fc-1', 'u1', 3, ${now.toISOString()}, 1200)`);

    const generator: CardGenerator = {
      generate: () => Promise.resolve(ok([{ type: "mcq", question: "Quel gaz ?", answer: "O2", options: ["O2", "CO2", "N2", "H2"] }])),
    };
    const result = await handleGenerationJob(
      { cardRepo: new SqliteCardRepository(db), notionRepo: new SqliteNotionRepository(db), generator, idGenerator: uuidV7Generator },
      { notionId: "n1", types: ["mcq"] },
      { jobId: "job-1", userId: "u1", attempt: 1, now },
    );

    expect(result.ok).toBe(true);
    expect(db.all(sql`SELECT id FROM cards WHERE id = 'fc-1'`)).toHaveLength(1);
    expect(db.all(sql`SELECT card_id FROM card_schedules WHERE card_id = 'fc-1'`)).toHaveLength(1);
    expect(db.all(sql`SELECT id FROM reviews WHERE card_id = 'fc-1'`)).toHaveLength(1);
    expect(db.all(sql`SELECT id FROM cards WHERE type = 'mcq'`)).toHaveLength(1);
  });
});
