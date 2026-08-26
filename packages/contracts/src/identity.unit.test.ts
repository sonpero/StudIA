import { describe, expect, it } from "vitest";
import { loginRequestSchema, meResponseSchema } from "./identity.js";

describe("loginRequestSchema", () => {
  it("accepts a username and password", () => {
    expect(loginRequestSchema.safeParse({ username: "alex", password: "s3cret" }).success).toBe(true);
  });

  it("rejects an empty username or password", () => {
    expect(loginRequestSchema.safeParse({ username: "", password: "s3cret" }).success).toBe(false);
    expect(loginRequestSchema.safeParse({ username: "alex", password: "" }).success).toBe(false);
  });

  it("rejects a missing field", () => {
    expect(loginRequestSchema.safeParse({ username: "alex" }).success).toBe(false);
  });
});

describe("meResponseSchema", () => {
  it("accepts an id and username", () => {
    expect(meResponseSchema.safeParse({ id: "u1", username: "alex" }).success).toBe(true);
  });

  it("rejects extra shapes missing required fields", () => {
    expect(meResponseSchema.safeParse({ id: "u1" }).success).toBe(false);
  });
});
