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
});
