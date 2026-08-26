import { describe, expect, it, vi } from "vitest";
import {
  fakeLoginAttemptRepository,
  fakePasswordHasher,
  fakeSessionCodec,
  fakeUserRepository,
} from "./fakes.js";
import { authenticate } from "./authenticate.js";

const now = new Date("2026-01-01T00:00:00Z");
const DUMMY_HASH = "hashed:__dummy__";

function buildDeps(overrides: Partial<Parameters<typeof authenticate>[0]> = {}) {
  return {
    userRepository: fakeUserRepository(),
    passwordHasher: fakePasswordHasher(),
    sessionCodec: fakeSessionCodec(),
    attemptRepository: fakeLoginAttemptRepository(),
    dummyPasswordHash: DUMMY_HASH,
    ...overrides,
  };
}

describe("authenticate", () => {
  it("succeeds with a valid username and password, and clears prior attempts for the ip", async () => {
    const passwordHasher = fakePasswordHasher();
    const userRepository = fakeUserRepository([
      { id: "u1", username: "alex", createdAt: now.toISOString(), sessionVersion: 1, passwordHash: await passwordHasher.hash("s3cret") },
    ]);
    const attemptRepository = fakeLoginAttemptRepository();
    attemptRepository.recordFailure("1.2.3.4", now);

    const result = await authenticate(
      buildDeps({ userRepository, passwordHasher, attemptRepository }),
      "alex",
      "s3cret",
      "1.2.3.4",
      now,
    );

    expect(result.ok).toBe(true);
    if (result.ok) expect(typeof result.value.token).toBe("string");
    expect(attemptRepository.getAttempts("1.2.3.4")).toEqual([]);
  });

  it("rejects a wrong password and records a failed attempt", async () => {
    const passwordHasher = fakePasswordHasher();
    const userRepository = fakeUserRepository([
      { id: "u1", username: "alex", createdAt: now.toISOString(), sessionVersion: 1, passwordHash: await passwordHasher.hash("s3cret") },
    ]);
    const attemptRepository = fakeLoginAttemptRepository();

    const result = await authenticate(
      buildDeps({ userRepository, passwordHasher, attemptRepository }),
      "alex",
      "wrong",
      "1.2.3.4",
      now,
    );

    expect(result).toEqual({ ok: false, error: { kind: "invalid-credentials" } });
    expect(attemptRepository.getAttempts("1.2.3.4")).toHaveLength(1);
  });

  it("rejects an unknown username, still verifying against the dummy hash for comparable timing", async () => {
    const verify = vi.fn().mockResolvedValue(false);
    const baseHasher = fakePasswordHasher();
    const passwordHasher = { hash: (plain: string) => baseHasher.hash(plain), verify };

    const result = await authenticate(
      buildDeps({ passwordHasher }),
      "ghost",
      "whatever",
      "1.2.3.4",
      now,
    );

    expect(result).toEqual({ ok: false, error: { kind: "invalid-credentials" } });
    expect(verify).toHaveBeenCalledTimes(1);
    expect(verify).toHaveBeenCalledWith(DUMMY_HASH, "whatever");
  });

  it("rate-limits after 5 failed attempts within 15 minutes, without checking the password", async () => {
    const verify = vi.fn().mockResolvedValue(false);
    const baseHasher = fakePasswordHasher();
    const passwordHasher = { hash: (plain: string) => baseHasher.hash(plain), verify };
    const attemptRepository = fakeLoginAttemptRepository();
    for (let i = 0; i < 5; i++) {
      attemptRepository.recordFailure("9.9.9.9", new Date(now.getTime() + i * 1000));
    }

    const result = await authenticate(
      buildDeps({ passwordHasher, attemptRepository }),
      "alex",
      "whatever",
      "9.9.9.9",
      new Date(now.getTime() + 6000),
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("rate-limited");
      if (result.error.kind === "rate-limited") expect(result.error.retryAfterSeconds).toBeGreaterThan(0);
    }
    expect(verify).not.toHaveBeenCalled();
  });
});
