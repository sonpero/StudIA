import { RATE_LIMIT_WINDOW_MS } from "../domain/rate-limit.js";
import type { LoginAttemptRepository } from "../domain/ports.js";

// Acceptable for a handful of users; say so rather than reaching for Redis
// (docs/modules/identity.md). Resets on restart, keyed by IP in memory.
export class InMemoryLoginAttemptRepository implements LoginAttemptRepository {
  private readonly attemptsByIp = new Map<string, Date[]>();

  getAttempts(ip: string): Date[] {
    return this.attemptsByIp.get(ip) ?? [];
  }

  recordFailure(ip: string, now: Date): void {
    const windowStart = now.getTime() - RATE_LIMIT_WINDOW_MS;
    const pruned = (this.attemptsByIp.get(ip) ?? []).filter((attempt) => attempt.getTime() > windowStart);
    pruned.push(now);
    this.attemptsByIp.set(ip, pruned);
  }

  clear(ip: string): void {
    this.attemptsByIp.delete(ip);
  }
}
