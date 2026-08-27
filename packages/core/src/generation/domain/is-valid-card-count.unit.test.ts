import { describe, expect, it } from "vitest";
import { isValidCardCount } from "./is-valid-card-count.js";

describe("isValidCardCount", () => {
  it("rejects zero: at least one card per notion", () => {
    expect(isValidCardCount(0)).toBe(false);
  });

  it("accepts exactly 1, the lower bound", () => {
    expect(isValidCardCount(1)).toBe(true);
  });

  it("accepts exactly 5, the upper bound", () => {
    expect(isValidCardCount(5)).toBe(true);
  });

  it("rejects above 5", () => {
    expect(isValidCardCount(6)).toBe(false);
  });
});
