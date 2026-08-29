import { describe, expect, it } from "vitest";
import { daysAway } from "./days-away.js";

const NOW = new Date("2026-03-02T09:00:00.000Z");

describe("daysAway", () => {
  it("is 0 for today", () => {
    expect(daysAway("2026-03-02", NOW)).toBe(0);
  });

  it("is 1 for tomorrow", () => {
    expect(daysAway("2026-03-03", NOW)).toBe(1);
  });

  it("is negative for a date in the past — a fact, not clamped to 0", () => {
    expect(daysAway("2026-02-28", NOW)).toBe(-2);
  });
});
