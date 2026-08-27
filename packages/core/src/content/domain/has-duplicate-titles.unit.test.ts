import { describe, expect, it } from "vitest";
import { hasDuplicateTitles } from "./has-duplicate-titles.js";

describe("hasDuplicateTitles", () => {
  it("is false for all-distinct titles", () => {
    expect(hasDuplicateTitles(["Photosynthèse", "Respiration cellulaire"])).toBe(false);
  });

  it("is true for an exact duplicate", () => {
    expect(hasDuplicateTitles(["Photosynthèse", "Photosynthèse"])).toBe(true);
  });

  it("is true for a duplicate differing only by case", () => {
    expect(hasDuplicateTitles(["Photosynthèse", "photosynthèse"])).toBe(true);
  });

  it("is true for a duplicate differing only by surrounding whitespace", () => {
    expect(hasDuplicateTitles(["Photosynthèse", "  Photosynthèse  "])).toBe(true);
  });

  it("is false for an empty or single-item list", () => {
    expect(hasDuplicateTitles([])).toBe(false);
    expect(hasDuplicateTitles(["Solo"])).toBe(false);
  });
});
