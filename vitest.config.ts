import path from "node:path";
import { defineConfig } from "vitest/config";

const commonInclude = ["apps/*/src/**", "packages/*/src/**"];

// apps/web's shadcn-derived components import via the "@" alias
// (components.json's aliases); each vitest project below is its own Vite
// instance, so the alias must be repeated per project rather than set once
// at the top level.
const webAlias = {
  "@": path.resolve(import.meta.dirname, "apps/web/src"),
};

export default defineConfig({
  test: {
    setupFiles: ["./tests/support/no-network.ts"],
    projects: [
      {
        resolve: { alias: webAlias },
        test: {
          name: "unit",
          environment: "node",
          include: commonInclude.map((dir) => `${dir}/*.unit.test.{ts,tsx}`),
        },
      },
      {
        resolve: { alias: webAlias },
        test: {
          name: "int",
          environment: "node",
          include: commonInclude.map((dir) => `${dir}/*.int.test.{ts,tsx}`),
        },
      },
      {
        resolve: { alias: webAlias },
        test: {
          name: "contract",
          environment: "node",
          include: commonInclude.map((dir) => `${dir}/*.contract.test.{ts,tsx}`),
        },
      },
    ],
  },
});
