import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import type { Db } from "./connection.js";

const migrationsFolder = fileURLToPath(new URL("../../drizzle", import.meta.url));

export function runMigrations(db: Db): void {
  migrate(db, { migrationsFolder });
}
