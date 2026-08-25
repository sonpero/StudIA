import { defineConfig } from "vitest/config";

const commonInclude = ["apps/*/src/**", "packages/*/src/**"];

export default defineConfig({
  test: {
    setupFiles: ["./tests/support/no-network.ts"],
    projects: [
      {
        test: {
          name: "unit",
          environment: "node",
          include: commonInclude.map((dir) => `${dir}/*.unit.test.{ts,tsx}`),
        },
      },
      {
        test: {
          name: "int",
          environment: "node",
          include: commonInclude.map((dir) => `${dir}/*.int.test.{ts,tsx}`),
        },
      },
      {
        test: {
          name: "contract",
          environment: "node",
          include: commonInclude.map((dir) => `${dir}/*.contract.test.{ts,tsx}`),
        },
      },
    ],
  },
});
