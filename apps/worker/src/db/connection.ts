import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";

// Same bootstrapping as apps/api/src/db/connection.ts: same image, same
// pragmas, but its own small copy rather than an apps/api import — the two
// are separate deploy entrypoints (CLAUDE.md), and this is too little logic
// to justify a new shared package.
export type Db = ReturnType<typeof drizzle>;

export function openDatabase(databasePath: string): Db {
  const sqlite = new Database(databasePath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("busy_timeout = 5000");
  sqlite.pragma("synchronous = NORMAL");
  sqlite.pragma("foreign_keys = ON");
  return drizzle(sqlite);
}
