// M11 with real SQLite: the whole course job against the real repositories,
// and "no LLM call inside a transaction" (CLAUDE.md rule 2) proven the same
// way as handle-generation-job.int.test.ts.
import Database from "better-sqlite3";
import { sql } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { freshDb, type Db } from "../../../../../tests/support/db.js";
import { SqliteNotionRepository } from "../../content/index.js";
import { SqliteDocumentRepository } from "../../ingestion/index.js";
import { ok, uuidV7Generator } from "../../shared/index.js";
import type { KeyNotionCardGenerator } from "../domain/ports.js";
import { FixtureKeyNotionCardGenerator } from "../infra/fixture-key-notion-card-generator.js";
import { FixtureKeyNotionExtractor } from "../infra/fixture-key-notion-extractor.js";
import { SqliteKeyNotionRepository } from "../infra/sqlite-key-notion-repository.js";
import { handleCourseGenerationJob } from "./handle-course-generation-job.js";

const now = new Date("2026-01-01T00:00:00.000Z");
const ctx = { jobId: "job-1", userId: "u1", attempt: 1, now };

function seed(db: Db): void {
  db.run(sql`INSERT INTO users (id, username, password_hash, session_version, created_at) VALUES ('u1', 'alice', 'x', 1, ${now.toISOString()})`);
  db.run(sql`INSERT INTO documents (id, user_id, title, source_type, status, colour, created_at)
      VALUES ('doc-1', 'u1', 'Cours', 'pdf', 'done', '#F87171', ${now.toISOString()})`);
  db.run(sql`INSERT INTO extractions (document_id, markdown, extracted_at) VALUES ('doc-1', '# Cours\n\nTexte.', ${now.toISOString()})`);
  for (const [index, id] of ["n1", "n2", "n3"].entries()) {
    db.run(sql`INSERT INTO notions (id, document_id, user_id, title, body, difficulty, position, created_at)
        VALUES (${id}, 'doc-1', 'u1', ${`Notion ${id}`}, 'Corps.', 'medium', ${index}, ${now.toISOString()})`);
  }
}

function deps(db: Db, generator: KeyNotionCardGenerator = new FixtureKeyNotionCardGenerator("valid")) {
  return {
    keyNotionRepo: new SqliteKeyNotionRepository(db),
    notionRepo: new SqliteNotionRepository(db),
    documentRepo: new SqliteDocumentRepository(db),
    extractor: new FixtureKeyNotionExtractor("valid"),
    generator,
    idGenerator: uuidV7Generator,
  };
}

describe("handleCourseGenerationJob with real SQLite", () => {
  let cleanup: (() => void) | undefined;
  afterEach(() => cleanup?.());

  it("writes key notions, their sources, the cards and their links; a second run adds nothing", async () => {
    const { db, cleanup: c } = freshDb();
    cleanup = c;
    seed(db);

    expect(await handleCourseGenerationJob(deps(db), { documentId: "doc-1" }, ctx)).toEqual({ ok: true, value: undefined });
    const count = (table: string) => db.all<{ n: number }>(sql.raw(`SELECT COUNT(*) AS n FROM ${table}`))[0]?.n;
    // Fixture: 3 key notions, 2 essential, 2 synthesis.
    expect(count("key_notions")).toBe(3);
    expect(count("key_notion_sources")).toBe(3);
    expect(db.all(sql`SELECT type, COUNT(*) AS n FROM cards GROUP BY type ORDER BY type`)).toEqual([
      { type: "flashcard", n: 3 },
      { type: "mcq", n: 2 },
      { type: "open", n: 2 },
    ]);
    expect(count("key_notion_cards")).toBe(7);

    await handleCourseGenerationJob(deps(db), { documentId: "doc-1" }, { ...ctx, attempt: 2 });
    expect(count("cards")).toBe(7);
    expect(count("key_notions")).toBe(3);
  });

  it("lets a concurrent connection write while a generation call is pending", async () => {
    const { db, path, cleanup: c } = freshDb();
    cleanup = c;
    seed(db);

    let release: (() => void) | undefined;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    const fixture = new FixtureKeyNotionCardGenerator("valid");
    const slow: KeyNotionCardGenerator = { generate: (input) => pending.then(() => fixture.generate(input)) };
    const job = handleCourseGenerationJob(deps(db, slow), { documentId: "doc-1" }, ctx);

    const second = new Database(path);
    second.pragma("busy_timeout = 5000");
    second.prepare("INSERT INTO users (id, username, password_hash, session_version, created_at) VALUES (?, ?, ?, ?, ?)").run("u2", "bob", "x", 1, now.toISOString());
    second.close();

    release?.();
    expect(await job).toEqual(ok(undefined));
  });
});
