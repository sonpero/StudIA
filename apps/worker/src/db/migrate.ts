import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import type { Db } from "./connection.js";

// Points at apps/api/drizzle: migrations are owned by one place regardless
// of which entrypoint applies them (worker starts before or alongside api
// on a redeploy; both must run the same migrations idempotently).
const migrationsFolder = fileURLToPath(new URL("../../../api/drizzle", import.meta.url));

export function runMigrations(db: Db): void {
  migrate(db, { migrationsFolder });
}
