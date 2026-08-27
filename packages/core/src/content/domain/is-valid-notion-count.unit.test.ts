import { describe, expect, it } from "vitest";
import { isValidNotionCount } from "./is-valid-notion-count.js";

describe("isValidNotionCount", () => {
  it("rejects below 5: splitting probably failed", () => {
    expect(isValidNotionCount(4)).toBe(false);
    expect(isValidNotionCount(0)).toBe(false);
  });

  it("accepts exactly 5, the lower bound", () => {
    expect(isValidNotionCount(5)).toBe(true);
  });

  it("accepts exactly 60, the upper bound", () => {
    expect(isValidNotionCount(60)).toBe(true);
  });

  it("rejects above 60: granularity too fine", () => {
    expect(isValidNotionCount(61)).toBe(false);
  });

  it("accepts a typical mid-range count", () => {
    expect(isValidNotionCount(20)).toBe(true);
  });
});
