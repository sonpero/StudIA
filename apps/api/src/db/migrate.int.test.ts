import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { sql } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { openDatabase } from "./connection.js";
import { runMigrations } from "./migrate.js";

const migrationsFolder = fileURLToPath(new URL("../../drizzle", import.meta.url));

const now = "2026-03-02T09:00:00.000Z";

function tableNames(db: ReturnType<typeof openDatabase>): string[] {
  return db.all<{ name: string }>(sql`SELECT name FROM sqlite_master WHERE type = 'table'`).map((row) => row.name);
}

describe("runMigrations", () => {
  let dir: string;
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  function tempDbPath(): string {
    dir = mkdtempSync(path.join(tmpdir(), "studia-migrate-"));
    return path.join(dir, "test.db");
  }

  it("replays cleanly on an empty database: availability and plan_history never exist, deadlines does", () => {
    const db = openDatabase(tempDbPath());
    runMigrations(db);

    const tables = tableNames(db);
    expect(tables).not.toContain("availability");
    expect(tables).not.toContain("plan_history");
    expect(tables).toContain("deadlines");
  });

  // Simulates the production Railway volume: a database that has only ever
  // run migrations up through 0006 (the last one before this milestone),
  // seeded with rows in all three of that milestone's tables. runMigrations
  // must then apply only the new migration (dropping availability and
  // plan_history) without re-running 0000-0006, and deadlines' data must
  // survive untouched (docs/modules/progress.md's migration discipline).
  it("replays cleanly from a database already at migration 0006 in production, preserving deadlines' rows", () => {
    const dbPath = tempDbPath();
    const journal = JSON.parse(readFileSync(path.join(migrationsFolder, "meta/_journal.json"), "utf8")) as {
      entries: { tag: string; when: number }[];
    };
    const cutoffIndex = journal.entries.findIndex((entry) => entry.tag === "0006_neat_clea");
    if (cutoffIndex === -1) throw new Error("migration 0006_neat_clea not found in the journal");
    const migrationsUpTo0006 = journal.entries.slice(0, cutoffIndex + 1);
    const lastApplied = journal.entries[cutoffIndex]!;

    const sqlite = new Database(dbPath);
    for (const entry of migrationsUpTo0006) {
      sqlite.exec(readFileSync(path.join(migrationsFolder, `${entry.tag}.sql`), "utf8"));
    }
    // Matches drizzle-orm's own migration-tracking table (sqlite-core
    // dialect): it only ever looks at the single most recent row's
    // created_at, so one row at 0006's own journal timestamp is enough to
    // make runMigrations below treat 0000-0006 as already applied.
    sqlite.exec("CREATE TABLE __drizzle_migrations (id INTEGER PRIMARY KEY, hash TEXT NOT NULL, created_at NUMERIC)");
    sqlite.prepare("INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)").run("seed-at-0006", lastApplied.when);

    sqlite.prepare("INSERT INTO users (id, username, password_hash, session_version, created_at) VALUES (?, ?, ?, ?, ?)").run("u1", "alice", "x", 1, now);
    sqlite
      .prepare("INSERT INTO documents (id, user_id, title, source_type, status, colour, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run("doc-1", "u1", "Cours", "photo", "done", "#F87171", now);
    sqlite
      .prepare("INSERT INTO deadlines (id, document_id, user_id, date, label, created_at) VALUES (?, ?, ?, ?, ?, ?)")
      .run("d1", "doc-1", "u1", "2026-03-20", "Contrôle", now);
    sqlite.prepare("INSERT INTO availability (user_id, minutes_json) VALUES (?, ?)").run("u1", "{}");
    sqlite.prepare("INSERT INTO plan_history (user_id, date, completed) VALUES (?, ?, ?)").run("u1", "2026-01-05", 1);
    sqlite.close();

    const db = openDatabase(dbPath);
    runMigrations(db);

    const tables = tableNames(db);
    expect(tables).not.toContain("availability");
    expect(tables).not.toContain("plan_history");
    expect(tables).toContain("deadlines");

    const deadlineRows = db.all<{ id: string; document_id: string; user_id: string; date: string; label: string | null; created_at: string }>(
      sql`SELECT * FROM deadlines`,
    );
    expect(deadlineRows).toEqual([{ id: "d1", document_id: "doc-1", user_id: "u1", date: "2026-03-20", label: "Contrôle", created_at: now }]);
  });

  // M10 Phase 2, lot 3: adds a `type` column to `pomodoro_sessions`
  // (packages/core/src/workspace/infra/schema.ts), not-null with a
  // default of 'focus' — the same "replays cleanly from a real production
  // database" shape as the 0006 test above, cut off one migration earlier
  // (0011, the last one before this lot's own). A row inserted under the
  // old schema, with no `type` column at all, must end up with `type =
  // 'focus'` once this migration runs: every session ever created before
  // this lot was one, and a NOT NULL column with a DEFAULT is exactly what
  // SQLite's own ALTER TABLE ADD COLUMN backfills existing rows with.
  it("replays cleanly from a database already at migration 0011, backfilling every pre-existing pomodoro_sessions row to type 'focus'", () => {
    const dbPath = tempDbPath();
    const journal = JSON.parse(readFileSync(path.join(migrationsFolder, "meta/_journal.json"), "utf8")) as {
      entries: { tag: string; when: number }[];
    };
    const cutoffIndex = journal.entries.findIndex((entry) => entry.tag === "0011_smart_wild_child");
    if (cutoffIndex === -1) throw new Error("migration 0011_smart_wild_child not found in the journal");
    const migrationsUpTo0011 = journal.entries.slice(0, cutoffIndex + 1);
    const lastApplied = journal.entries[cutoffIndex]!;

    const sqlite = new Database(dbPath);
    for (const entry of migrationsUpTo0011) {
      sqlite.exec(readFileSync(path.join(migrationsFolder, `${entry.tag}.sql`), "utf8"));
    }
    sqlite.exec("CREATE TABLE __drizzle_migrations (id INTEGER PRIMARY KEY, hash TEXT NOT NULL, created_at NUMERIC)");
    sqlite.prepare("INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)").run("seed-at-0011", lastApplied.when);

    sqlite.prepare("INSERT INTO users (id, username, password_hash, session_version, created_at) VALUES (?, ?, ?, ?, ?)").run("u1", "alice", "x", 1, now);
    sqlite
      .prepare("INSERT INTO pomodoro_sessions (id, user_id, todo_id, started_at, ended_at, duration_seconds) VALUES (?, ?, ?, ?, ?, ?)")
      .run("p1", "u1", null, now, null, 1500);
    sqlite.close();

    const db = openDatabase(dbPath);
    runMigrations(db);

    const rows = db.all<{ id: string; user_id: string; type: string }>(sql`SELECT id, user_id, type FROM pomodoro_sessions`);
    expect(rows).toEqual([{ id: "p1", user_id: "u1", type: "focus" }]);
  });

  // M11 (docs/reports/notions-cles-conception.md): the key-notion migration
  // is additive only. A production database at 0012 with cards and review
  // history must come out with every one of those rows unchanged.
  it("replays cleanly from a database already at migration 0012, leaving cards, schedules and reviews untouched", () => {
    const dbPath = tempDbPath();
    const journal = JSON.parse(readFileSync(path.join(migrationsFolder, "meta/_journal.json"), "utf8")) as {
      entries: { tag: string; when: number }[];
    };
    const cutoffIndex = journal.entries.findIndex((entry) => entry.tag === "0012_wise_calypso");
    if (cutoffIndex === -1) throw new Error("migration 0012_wise_calypso not found in the journal");
    const lastApplied = journal.entries[cutoffIndex]!;

    const sqlite = new Database(dbPath);
    for (const entry of journal.entries.slice(0, cutoffIndex + 1)) {
      sqlite.exec(readFileSync(path.join(migrationsFolder, `${entry.tag}.sql`), "utf8"));
    }
    sqlite.exec("CREATE TABLE __drizzle_migrations (id INTEGER PRIMARY KEY, hash TEXT NOT NULL, created_at NUMERIC)");
    sqlite.prepare("INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)").run("seed-at-0012", lastApplied.when);

    sqlite.prepare("INSERT INTO users (id, username, password_hash, session_version, created_at) VALUES (?, ?, ?, ?, ?)").run("u1", "alice", "x", 1, now);
    sqlite
      .prepare("INSERT INTO documents (id, user_id, title, source_type, status, colour, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run("d1", "u1", "Cours", "pdf", "done", "#F87171", now);
    sqlite
      .prepare("INSERT INTO notions (id, document_id, user_id, title, body, difficulty, position, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .run("n1", "d1", "u1", "Notion", "Corps.", "medium", 0, now);
    sqlite
      .prepare("INSERT INTO cards (id, notion_id, user_id, type, state, question, answer, options_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .run("c1", "n1", "u1", "mcq", "active", "Q ?", "A", '["A","B","C","D"]', now);
    sqlite
      .prepare("INSERT INTO card_schedules (card_id, user_id, due, stability, difficulty, reps, lapses, last_reviewed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .run("c1", "u1", now, 12.5, 4.2, 3, 1, now);
    sqlite.prepare("INSERT INTO reviews (id, card_id, user_id, rating, reviewed_at, elapsed_ms) VALUES (?, ?, ?, ?, ?, ?)").run("r1", "c1", "u1", 3, now, 900);
    const before = {
      cards: sqlite.prepare("SELECT * FROM cards").all(),
      schedules: sqlite.prepare("SELECT * FROM card_schedules").all(),
      reviews: sqlite.prepare("SELECT * FROM reviews").all(),
    };
    sqlite.close();

    const db = openDatabase(dbPath);
    runMigrations(db);

    expect(db.all(sql`SELECT * FROM cards`)).toEqual(before.cards);
    expect(db.all(sql`SELECT * FROM card_schedules`)).toEqual(before.schedules);
    expect(db.all(sql`SELECT * FROM reviews`)).toEqual(before.reviews);
    expect(tableNames(db)).toEqual(expect.arrayContaining(["key_notions", "key_notion_sources", "key_notion_cards"]));
  });
});
