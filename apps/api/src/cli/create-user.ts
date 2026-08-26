import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { createOrResetAccount, Argon2PasswordHasher, SqliteUserRepository, uuidV7Generator } from "@studia/core";
import { openDatabase } from "../db/connection.js";
import { runMigrations } from "../db/migrate.js";
import { readPassword } from "./read-password.js";

// CLI only, never reachable over HTTP (docs/modules/identity.md).
async function main(): Promise<void> {
  const username = process.argv[2];
  if (!username) {
    console.error("Usage: pnpm users:create <username>");
    process.exit(1);
  }

  const password = await readPassword("Password: ");

  if (!password) {
    console.error("Password cannot be empty.");
    process.exit(1);
  }

  const dataDir = process.env.DATA_DIR ?? path.resolve(process.cwd(), ".data");
  if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });

  const db = openDatabase(path.join(dataDir, "studia.db"));
  runMigrations(db);

  const result = await createOrResetAccount(
    {
      userRepository: new SqliteUserRepository(db),
      passwordHasher: new Argon2PasswordHasher(),
      idGenerator: uuidV7Generator,
    },
    username,
    password,
    new Date(),
  );

  if (!result.ok) {
    // createOrResetAccount's error type is `never`; this branch is
    // unreachable and exists only to narrow the type below.
    throw new Error("unreachable");
  }
  console.log(`Account ready: ${username} (id ${result.value.id})`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
