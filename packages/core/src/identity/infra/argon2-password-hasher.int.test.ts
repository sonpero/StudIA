import { describe, expect, it } from "vitest";
import { Argon2PasswordHasher } from "./argon2-password-hasher.js";

describe("Argon2PasswordHasher", () => {
  it("round-trips: hash then verify with the same plaintext succeeds", async () => {
    const hasher = new Argon2PasswordHasher();
    const hash = await hasher.hash("s3cret");

    expect(await hasher.verify(hash, "s3cret")).toBe(true);
  });

  it("rejects a wrong password", async () => {
    const hasher = new Argon2PasswordHasher();
    const hash = await hasher.hash("s3cret");

    expect(await hasher.verify(hash, "wrong")).toBe(false);
  });

  it("produces argon2id hashes", async () => {
    const hasher = new Argon2PasswordHasher();
    const hash = await hasher.hash("s3cret");

    expect(hash.startsWith("$argon2id$")).toBe(true);
  });
});
