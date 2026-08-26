import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { describe, expect, it } from "vitest";

const apiRoot = fileURLToPath(new URL("..", import.meta.url));
const tsxBin = path.join(apiRoot, "node_modules", ".bin", "tsx");

describe("server startup", () => {
  it("exits non-zero with a clear stderr message when SESSION_SECRET is not set", () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { SESSION_SECRET, ...envWithoutSecret } = process.env;

    const result = spawnSync(tsxBin, ["src/server.ts"], {
      cwd: apiRoot,
      env: envWithoutSecret,
      encoding: "utf8",
      timeout: 15_000,
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("SESSION_SECRET");
  });
});
