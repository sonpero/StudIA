// Proves "no LLM call inside a transaction" (CLAUDE.md rule 2,
// docs/MILESTONES.md's M3 acceptance criterion) empirically rather than by
// code review: while the splitter call is in flight, a second connection to
// the SAME database file must be able to write immediately. If the splitter
// were ever called from inside a db.transaction(...), SQLite would hold a
// write lock for the whole (potentially tens-of-seconds) call, and this
// second write would stall past the timeout below.
import Database from "better-sqlite3";
import { sql } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { freshDb, type Db } from "../../../../../tests/support/db.js";
import { ok, uuidV7Generator } from "../../shared/index.js";
import { SqliteDocumentRepository } from "../../ingestion/index.js";
import { SqliteNotionRepository } from "../infra/sqlite-notion-repository.js";
import type { NotionSplitter } from "../domain/ports.js";
import { handleSplitJob } from "./handle-split-job.js";

const now = new Date("2026-01-01T00:00:00.000Z");

function seedUser(db: Db, id: string): void {
  db.run(sql`INSERT INTO users (id, username, password_hash, session_version, created_at)
      VALUES (${id}, ${`user-${id}`}, 'x', 1, ${now.toISOString()})`);
}

describe("handleSplitJob does not hold a transaction open while the splitter is in flight", () => {
  let cleanup: (() => void) | undefined;
  afterEach(() => cleanup?.());

  it("lets a concurrent connection write to the same database while the splitter call is pending", async () => {
    const { db, path, cleanup: c } = freshDb();
    cleanup = c;
    seedUser(db, "u1");
    db.run(sql`INSERT INTO documents (id, user_id, title, source_type, status, colour, created_at)
        VALUES ('doc-1', 'u1', 'Cours', 'photo', 'done', '#F87171', ${now.toISOString()})`);
    db.run(sql`INSERT INTO extractions (document_id, markdown, extracted_at)
        VALUES ('doc-1', '# Chapitre 1\n\nContenu.', ${now.toISOString()})`);

    const notionRepo = new SqliteNotionRepository(db);
    const documentRepo = new SqliteDocumentRepository(db);

    let releaseSplitter: (() => void) | undefined;
    const stillPending = new Promise<void>((resolve) => {
      releaseSplitter = resolve;
    });
    const slowSplitter: NotionSplitter = {
      split: () =>
        new Promise((resolve) => {
          // Only resolves once the test below has proven the concurrent
          // write below succeeded — i.e. genuinely still in flight, not a
          // race against a fast promise microtask.
          void stillPending.then(() =>
            resolve(
              ok(
                Array.from({ length: 5 }, (_, i) => ({
                  title: `Notion ${String(i)}`,
                  body: `Corps ${String(i)}.`,
                  difficulty: "medium" as const,
                })),
              ),
            ),
          );
        }),
    };

    const jobPromise = handleSplitJob(
      { notionRepo, documentRepo, splitter: slowSplitter, idGenerator: uuidV7Generator },
      { documentId: "doc-1" },
      { jobId: "job-1", userId: "u1", attempt: 1, now },
    );

    // A second, independent connection to the SAME file. busy_timeout is
    // 5000ms (docs/modules/ingestion.md's pragmas) — if a transaction were
    // held open around the splitter call, this insert would hang until that
    // timeout and this test would time out well before it, given Vitest's
    // default 5s test timeout is shorter. It succeeding immediately is the
    // proof.
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

    releaseSplitter?.();
    const result = await jobPromise;

    expect(result).toEqual({ ok: true, value: undefined });
  });
});
