import path from "node:path";
import { fileURLToPath } from "node:url";

const supportDir = fileURLToPath(new URL(".", import.meta.url));
const e2eDir = path.join(supportDir, "..");

export const E2E_PORT = 4173;
export const BASE_URL = `http://localhost:${String(E2E_PORT)}`;
export const E2E_DATA_DIR = path.join(e2eDir, ".data");
export const STORAGE_STATE_PATH = path.join(e2eDir, ".auth", "user.json");

// Fine to hardcode: this secret only ever signs sessions for a throwaway,
// per-run e2e database (see E2E_DATA_DIR), never a real deployment.
export const SESSION_SECRET = "e2e-session-secret-not-for-real-use";

export const TEST_USERNAME = "e2e-user";
export const TEST_PASSWORD = "e2e-Sup3r-Secret!";
