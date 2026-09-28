import { describe, expect, it } from "vitest";
import { isTitleTooShort } from "./is-valid-title.js";

describe("isTitleTooShort", () => {
  it("is true under 3 characters, after trimming", () => {
    expect(isTitleTooShort("Hi")).toBe(true);
    expect(isTitleTooShort("  Hi  ")).toBe(true);
  });

  it("is false from exactly 3 characters", () => {
    expect(isTitleTooShort("Ion")).toBe(false);
  });

  it("is false for a title over 80 characters: length above is fitTitle's concern", () => {
    expect(isTitleTooShort("a".repeat(150))).toBe(false);
  });
});
