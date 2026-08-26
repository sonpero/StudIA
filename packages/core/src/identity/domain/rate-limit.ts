export const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const WINDOW_MS = RATE_LIMIT_WINDOW_MS;
const MAX_ATTEMPTS = 5;

function recentAttempts(attempts: Date[], now: Date): Date[] {
  const windowStart = now.getTime() - WINDOW_MS;
  return attempts.filter((attempt) => attempt.getTime() > windowStart);
}

export function isRateLimited(attempts: Date[], now: Date): boolean {
  return recentAttempts(attempts, now).length >= MAX_ATTEMPTS;
}

export function rateLimitRetryAfterSeconds(attempts: Date[], now: Date): number {
  const recent = recentAttempts(attempts, now);
  const oldest = recent.reduce(
    (min, attempt) => (attempt.getTime() < min.getTime() ? attempt : min),
    recent[0] ?? now,
  );
  return Math.ceil((oldest.getTime() + WINDOW_MS - now.getTime()) / 1000);
}
