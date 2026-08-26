import { describe, expect, it } from "vitest";
import { fakeSessionCodec, fakeUserRepository } from "./fakes.js";
import { resolveSession } from "./resolve-session.js";

const now = new Date("2026-01-01T00:00:00Z");

describe("resolveSession", () => {
  it("resolves the user for a valid token", async () => {
    const sessionCodec = fakeSessionCodec();
    const userRepository = fakeUserRepository([
      { id: "u1", username: "alex", createdAt: now.toISOString(), sessionVersion: 1, passwordHash: "x" },
    ]);
    const token = sessionCodec.sign({ userId: "u1", sessionVersion: 1 }, now);

    const result = await resolveSession({ sessionCodec, userRepository }, token, now);

    expect(result).toEqual({ ok: true, value: { id: "u1", username: "alex", createdAt: now.toISOString() } });
  });

  it("rejects when the codec cannot read the token (bad signature or expiry)", async () => {
    const sessionCodec = fakeSessionCodec();
    const userRepository = fakeUserRepository();

    const result = await resolveSession({ sessionCodec, userRepository }, "not-a-real-token", now);

    expect(result).toEqual({ ok: false, error: "unauthenticated" });
  });

  it("rejects when the user no longer exists", async () => {
    const sessionCodec = fakeSessionCodec();
    const userRepository = fakeUserRepository();
    const token = sessionCodec.sign({ userId: "gone", sessionVersion: 1 }, now);

    const result = await resolveSession({ sessionCodec, userRepository }, token, now);

    expect(result).toEqual({ ok: false, error: "unauthenticated" });
  });

  it("rejects when sessionVersion in the token no longer matches the stored one (revoked by password reset)", async () => {
    const sessionCodec = fakeSessionCodec();
    const userRepository = fakeUserRepository([
      { id: "u1", username: "alex", createdAt: now.toISOString(), sessionVersion: 2, passwordHash: "x" },
    ]);
    const token = sessionCodec.sign({ userId: "u1", sessionVersion: 1 }, now);

    const result = await resolveSession({ sessionCodec, userRepository }, token, now);

    expect(result).toEqual({ ok: false, error: "unauthenticated" });
  });
});
