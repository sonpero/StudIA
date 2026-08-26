import { describe, expect, it } from "vitest";
import { isRateLimited, rateLimitRetryAfterSeconds } from "./rate-limit.js";

const at = (iso: string) => new Date(iso);

describe("isRateLimited", () => {
  it("allows the first attempt with an empty log", () => {
    expect(isRateLimited([], at("2026-01-01T00:00:00Z"))).toBe(false);
  });

  it("allows up to 4 attempts within the window", () => {
    const attempts = [
      at("2026-01-01T00:00:00Z"),
      at("2026-01-01T00:01:00Z"),
      at("2026-01-01T00:02:00Z"),
      at("2026-01-01T00:03:00Z"),
    ];
    expect(isRateLimited(attempts, at("2026-01-01T00:04:00Z"))).toBe(false);
  });

  it("blocks on the 5th attempt within 15 minutes", () => {
    const attempts = [
      at("2026-01-01T00:00:00Z"),
      at("2026-01-01T00:01:00Z"),
      at("2026-01-01T00:02:00Z"),
      at("2026-01-01T00:03:00Z"),
      at("2026-01-01T00:04:00Z"),
    ];
    expect(isRateLimited(attempts, at("2026-01-01T00:05:00Z"))).toBe(true);
  });

  it("slides the window: an attempt older than 15 minutes no longer counts", () => {
    const attempts = [
      at("2026-01-01T00:00:00Z"), // exactly 15min before `now`, falls outside the open window
      at("2026-01-01T00:01:00Z"),
      at("2026-01-01T00:02:00Z"),
      at("2026-01-01T00:03:00Z"),
    ];
    expect(isRateLimited(attempts, at("2026-01-01T00:15:00Z"))).toBe(false);
  });

  it("does not block exactly at the boundary of a 5th recent attempt after the window slid one out", () => {
    const attempts = [
      at("2026-01-01T00:00:00Z"),
      at("2026-01-01T00:01:00Z"),
      at("2026-01-01T00:02:00Z"),
      at("2026-01-01T00:03:00Z"),
      at("2026-01-01T00:04:00Z"),
    ];
    // now is 15 minutes after the 2nd attempt: only attempts 2..5 (4 of them) remain in window
    expect(isRateLimited(attempts, at("2026-01-01T00:16:00Z"))).toBe(false);
  });
});

describe("rateLimitRetryAfterSeconds", () => {
  it("returns the seconds until the oldest attempt in the window ages out", () => {
    const attempts = [
      at("2026-01-01T00:00:00Z"),
      at("2026-01-01T00:01:00Z"),
      at("2026-01-01T00:02:00Z"),
      at("2026-01-01T00:03:00Z"),
      at("2026-01-01T00:04:00Z"),
    ];
    // oldest attempt ages out of the 15min window at 00:15:00; now is 00:05:00
    expect(rateLimitRetryAfterSeconds(attempts, at("2026-01-01T00:05:00Z"))).toBe(600);
  });
});
