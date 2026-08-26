const BASE_DELAY_MS = 30_000;
const MAX_DELAY_MS = 15 * 60 * 1000;

// Pure function of (attempts, now); attempts is the count AFTER this
// failure is recorded (see fail()'s doc comment in infra/sqlite-job-queue.ts
// for why attempts is only ever incremented there, never at claim time).
export function computeBackoffRunAfter(attempts: number, now: Date): string {
  const delayMs = Math.min(2 ** attempts * BASE_DELAY_MS, MAX_DELAY_MS);
  return new Date(now.getTime() + delayMs).toISOString();
}
