import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";

export type Db = ReturnType<typeof drizzle>;

export function openDatabase(databasePath: string): Db {
  const sqlite = new Database(databasePath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("busy_timeout = 5000");
  sqlite.pragma("synchronous = NORMAL");
  sqlite.pragma("foreign_keys = ON");
  return drizzle(sqlite);
}
