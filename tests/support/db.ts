import { copyFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

export type Db = ReturnType<typeof drizzle>;

const migrationsFolder = fileURLToPath(new URL("../../apps/api/drizzle", import.meta.url));

let templatePath: string | null = null;

// Migrating is slow; every test copies this once-migrated template instead
// of re-running migrations (docs/TESTING.md).
function buildTemplate(): string {
  if (templatePath) return templatePath;
  const dir = mkdtempSync(path.join(tmpdir(), "studia-db-template-"));
  const file = path.join(dir, "template.db");
  const sqlite = new Database(file);
  migrate(drizzle(sqlite), { migrationsFolder });
  sqlite.close();
  templatePath = file;
  return file;
}

export function freshDb(): { db: Db; path: string; cleanup: () => void } {
  const dir = mkdtempSync(path.join(tmpdir(), "studia-db-"));
  const dbPath = path.join(dir, "test.db");
  copyFileSync(buildTemplate(), dbPath);

  const sqlite = new Database(dbPath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("busy_timeout = 5000");
  sqlite.pragma("synchronous = NORMAL");
  sqlite.pragma("foreign_keys = ON");

  return {
    db: drizzle(sqlite),
    path: dbPath,
    cleanup: () => {
      sqlite.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}
