import { defineConfig, devices } from "@playwright/test";
import { BASE_URL, E2E_DATA_DIR, E2E_PORT, SESSION_SECRET, STORAGE_STATE_PATH } from "./e2e/support/env.js";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: "html",
  globalSetup: "./e2e/support/global-setup.ts",
  globalTeardown: "./e2e/support/global-teardown.ts",
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
  },
  // Against a real build, not the Vite dev server (docs/TESTING.md): the
  // built SPA served by the API from one origin, matching production and
  // avoiding the dev-only proxy that once broke the Origin/Host CSRF check.
  webServer: {
    command: "pnpm --filter @studia/web run build && pnpm --filter @studia/api run start",
    url: `${BASE_URL}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      NODE_ENV: "production",
      PORT: String(E2E_PORT),
      DATA_DIR: E2E_DATA_DIR,
      SESSION_SECRET,
      COOKIE_SECURE: "false",
      LLM_ADAPTER: "fixture",
    },
  },
  // Every e2e test starts authenticated via the storageState saved in
  // global setup, except e2e/login.spec.ts which explicitly overrides it to
  // a blank state: the login flow itself must be exercised for real
  // (docs/TESTING.md).
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], storageState: STORAGE_STATE_PATH },
    },
  ],
});
