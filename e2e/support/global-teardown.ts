import { rmSync } from "node:fs";
import { E2E_DATA_DIR } from "./env.js";

// "One database per run ... deleted afterwards" (docs/TESTING.md).
export default function globalTeardown(): void {
  rmSync(E2E_DATA_DIR, { recursive: true, force: true });
}
