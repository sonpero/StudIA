import { defineConfig } from "vitest/config";

// Separate from vitest.config.ts on purpose: no no-network setup file here
// (docs/TESTING.md — "pnpm eval runs with a separate config that does not
// install this setup"), real API calls, never run in CI, no pass/fail gate
// on a pull request.
export default defineConfig({
  test: {
    name: "eval",
    environment: "node",
    include: ["evals/**/*.eval.test.ts"],
    testTimeout: 600_000,
  },
});
