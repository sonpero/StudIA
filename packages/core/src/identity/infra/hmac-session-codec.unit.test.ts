import { describe, expect, it } from "vitest";
import { HmacSessionCodec } from "./hmac-session-codec.js";

const now = new Date("2026-01-01T00:00:00Z");

describe("HmacSessionCodec", () => {
  it("round-trips a signed payload", () => {
    const codec = new HmacSessionCodec("s3cret-signing-key");
    const token = codec.sign({ userId: "u1", sessionVersion: 1 }, now);

    expect(codec.read(token, now)).toEqual({ userId: "u1", sessionVersion: 1 });
  });

  it("rejects a token whose signature was tampered with", () => {
    const codec = new HmacSessionCodec("s3cret-signing-key");
    const token = codec.sign({ userId: "u1", sessionVersion: 1 }, now);
    const [body] = token.split(".");
    const tampered = `${body}.not-the-real-signature`;

    expect(codec.read(tampered, now)).toBeNull();
  });

  it("rejects a token whose body was tampered with (signature no longer matches)", () => {
    const codec = new HmacSessionCodec("s3cret-signing-key");
    const token = codec.sign({ userId: "u1", sessionVersion: 1 }, now);
    const [, sig] = token.split(".");
    const forgedBody = Buffer.from(JSON.stringify({ userId: "attacker", sessionVersion: 1, exp: now.getTime() + 1000 })).toString(
      "base64url",
    );

    expect(codec.read(`${forgedBody}.${sig}`, now)).toBeNull();
  });

  it("rejects a token signed with a different secret", () => {
    const token = new HmacSessionCodec("secret-a").sign({ userId: "u1", sessionVersion: 1 }, now);

    expect(new HmacSessionCodec("secret-b").read(token, now)).toBeNull();
  });

  it("rejects an expired token", () => {
    const codec = new HmacSessionCodec("s3cret-signing-key");
    const token = codec.sign({ userId: "u1", sessionVersion: 1 }, now);
    const in31Days = new Date(now.getTime() + 31 * 24 * 60 * 60 * 1000);

    expect(codec.read(token, in31Days)).toBeNull();
  });

  it("rejects a garbage token", () => {
    const codec = new HmacSessionCodec("s3cret-signing-key");

    expect(codec.read("not-a-token", now)).toBeNull();
    expect(codec.read("", now)).toBeNull();
  });
});
