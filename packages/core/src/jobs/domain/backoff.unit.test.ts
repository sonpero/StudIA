import { describe, expect, it } from "vitest";
import { computeBackoffRunAfter } from "./backoff.js";

const now = new Date("2026-01-01T00:00:00.000Z");

describe("computeBackoffRunAfter", () => {
  it.each([
    [0, "2026-01-01T00:00:30.000Z"], // 2^0 * 30s = 30s
    [1, "2026-01-01T00:01:00.000Z"], // 2^1 * 30s = 60s
    [2, "2026-01-01T00:02:00.000Z"], // 2^2 * 30s = 120s
    [3, "2026-01-01T00:04:00.000Z"], // 2^3 * 30s = 240s
    [4, "2026-01-01T00:08:00.000Z"], // 2^4 * 30s = 480s
    [5, "2026-01-01T00:15:00.000Z"], // 2^5 * 30s = 960s, capped at 900s (15min)
  ])("attempts=%i -> %s", (attempts, expected) => {
    expect(computeBackoffRunAfter(attempts, now)).toBe(expected);
  });

  it("never exceeds the 15 minute cap for large attempt counts", () => {
    expect(computeBackoffRunAfter(20, now)).toBe("2026-01-01T00:15:00.000Z");
  });
});
