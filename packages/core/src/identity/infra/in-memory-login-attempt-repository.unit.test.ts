import { describe, expect, it } from "vitest";
import { InMemoryLoginAttemptRepository } from "./in-memory-login-attempt-repository.js";

describe("InMemoryLoginAttemptRepository", () => {
  it("returns no attempts for an ip that has never failed", () => {
    const repo = new InMemoryLoginAttemptRepository();
    expect(repo.getAttempts("1.2.3.4")).toEqual([]);
  });

  it("records failures per ip, keyed independently", () => {
    const repo = new InMemoryLoginAttemptRepository();
    const t1 = new Date("2026-01-01T00:00:00Z");
    const t2 = new Date("2026-01-01T00:01:00Z");

    repo.recordFailure("1.1.1.1", t1);
    repo.recordFailure("1.1.1.1", t2);
    repo.recordFailure("2.2.2.2", t1);

    expect(repo.getAttempts("1.1.1.1")).toEqual([t1, t2]);
    expect(repo.getAttempts("2.2.2.2")).toEqual([t1]);
  });

  it("clears attempts for an ip", () => {
    const repo = new InMemoryLoginAttemptRepository();
    repo.recordFailure("1.1.1.1", new Date("2026-01-01T00:00:00Z"));

    repo.clear("1.1.1.1");

    expect(repo.getAttempts("1.1.1.1")).toEqual([]);
  });

  it("prunes attempts older than the rate-limit window so memory does not grow unbounded", () => {
    const repo = new InMemoryLoginAttemptRepository();
    const old = new Date("2026-01-01T00:00:00Z");
    const recent = new Date("2026-01-01T00:20:00Z"); // 20 minutes later, outside the 15min window

    repo.recordFailure("1.1.1.1", old);
    repo.recordFailure("1.1.1.1", recent);

    expect(repo.getAttempts("1.1.1.1")).toEqual([recent]);
  });
});
