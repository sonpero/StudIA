import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { request as playwrightRequest, type APIRequestContext } from "@playwright/test";
import { Argon2PasswordHasher, createOrResetAccount, SqliteUserRepository, uuidV7Generator } from "@studia/core";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { BASE_URL, E2E_DATA_DIR, STORAGE_STATE_PATH, TEST_PASSWORD, TEST_USERNAME } from "./env.js";

const migrationsFolder = fileURLToPath(new URL("../../apps/api/drizzle", import.meta.url));

// Runs once, after the webServer (see playwright.config.ts) is up and has
// already opened+migrated the e2e database at startup. This seeds the one
// e2e account directly against that same file (createOrResetAccount is CLI
// only, never reachable over HTTP — docs/modules/identity.md) and then logs
// in once for real over HTTP, saving the resulting session cookie as
// storageState for every other e2e test to reuse (docs/TESTING.md). The
// login flow itself is NOT tested here: e2e/login.spec.ts exercises it for
// real, starting from a blank storageState.
export default async function globalSetup(): Promise<void> {
  await seedTestAccount();
  await loginAndSaveStorageState();
}

async function seedTestAccount(): Promise<void> {
  mkdirSync(E2E_DATA_DIR, { recursive: true });
  const sqlite = new Database(path.join(E2E_DATA_DIR, "studia.db"));
  sqlite.pragma("busy_timeout = 5000");
  const db = drizzle(sqlite);
  migrate(db, { migrationsFolder });

  await createOrResetAccount(
    {
      userRepository: new SqliteUserRepository(db),
      passwordHasher: new Argon2PasswordHasher(),
      idGenerator: uuidV7Generator,
    },
    TEST_USERNAME,
    TEST_PASSWORD,
    new Date(),
  );

  sqlite.close();
}

async function loginAndSaveStorageState(): Promise<void> {
  const requestContext = await playwrightRequest.newContext({ baseURL: BASE_URL });
  await waitUntilHealthy(requestContext);

  const res = await requestContext.post("/api/auth/login", {
    data: { username: TEST_USERNAME, password: TEST_PASSWORD },
  });
  if (res.status() !== 204) {
    throw new Error(`e2e global setup: seeded login failed with status ${String(res.status())}`);
  }

  await requestContext.storageState({ path: STORAGE_STATE_PATH });
  await requestContext.dispose();
}

async function waitUntilHealthy(requestContext: APIRequestContext): Promise<void> {
  const attempts = 30;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const res = await requestContext.get("/api/health");
      if (res.ok()) return;
    } catch {
      // API not accepting connections yet; retry below.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("e2e global setup: API never became healthy");
}
