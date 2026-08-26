import { describe, expect, it } from "vitest";
import { fakeIdGenerator, fakePasswordHasher, fakeUserRepository } from "./fakes.js";
import { createOrResetAccount } from "./create-or-reset-account.js";

const now = new Date("2026-01-01T00:00:00Z");

describe("createOrResetAccount", () => {
  it("creates a new account with a hashed password when the username does not exist", async () => {
    const userRepository = fakeUserRepository();
    const passwordHasher = fakePasswordHasher();
    const idGenerator = fakeIdGenerator(["new-id"]);

    const result = await createOrResetAccount({ userRepository, passwordHasher, idGenerator }, "alex", "s3cret", now);

    expect(result).toEqual({ ok: true, value: { id: "new-id" } });
    expect(userRepository.rows).toEqual([
      { id: "new-id", username: "alex", passwordHash: "hashed:s3cret", sessionVersion: 1, createdAt: now.toISOString() },
    ]);
  });

  it("resets the password and bumps sessionVersion when the username already exists", async () => {
    const passwordHasher = fakePasswordHasher();
    const userRepository = fakeUserRepository([
      { id: "u1", username: "alex", createdAt: now.toISOString(), sessionVersion: 1, passwordHash: "hashed:old" },
    ]);
    const idGenerator = fakeIdGenerator(["unused"]);

    const result = await createOrResetAccount({ userRepository, passwordHasher, idGenerator }, "alex", "new-pass", now);

    expect(result).toEqual({ ok: true, value: { id: "u1" } });
    expect(userRepository.rows).toEqual([
      { id: "u1", username: "alex", passwordHash: "hashed:new-pass", sessionVersion: 2, createdAt: now.toISOString() },
    ]);
  });
});
