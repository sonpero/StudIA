import { describe, expect, it } from "vitest";
import { isValidTitle } from "./is-valid-title.js";

describe("isValidTitle", () => {
  it("accepts a title within 3 to 80 characters", () => {
    expect(isValidTitle("La photosynthèse")).toBe(true);
  });

  it("rejects a title under 3 characters, after trimming", () => {
    expect(isValidTitle("Hi")).toBe(false);
    expect(isValidTitle("  Hi  ")).toBe(false);
  });

  it("accepts exactly 3 characters", () => {
    expect(isValidTitle("Ion")).toBe(true);
  });

  it("accepts exactly 80 characters", () => {
    expect(isValidTitle("a".repeat(80))).toBe(true);
  });

  it("rejects over 80 characters", () => {
    expect(isValidTitle("a".repeat(81))).toBe(false);
  });
});
