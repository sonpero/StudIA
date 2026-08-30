import { defineConfig, devices } from "@playwright/test";
import { BASE_URL, E2E_DATA_DIR, E2E_PORT, SESSION_SECRET, STORAGE_STATE_PATH } from "./e2e/support/env.js";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  // One worker, deliberately (docs/TESTING.md's End-to-end section): every
  // spec that creates a document pushes an extraction job into the same
  // queue, and only one worker process drains it. Parallel Playwright
  // workers compete for that queue, not for anything CPU- or IO-bound they
  // could actually parallelize, so more Playwright workers only lengthens
  // everyone's wait rather than shortening the suite.
  workers: 1,
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
  // Two services, same DATA_DIR: M2's extraction jobs need a real worker
  // actually draining the queue, not just the API enqueuing them.
  webServer: [
    {
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
    {
      command: "pnpm --filter @studia/worker run start",
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: {
        DATA_DIR: E2E_DATA_DIR,
        LLM_ADAPTER: "fixture",
      },
    },
  ],
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
