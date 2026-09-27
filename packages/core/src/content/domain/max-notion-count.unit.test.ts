import { describe, expect, it } from "vitest";
import { isValidNotionCount, maxNotionCount } from "./is-valid-notion-count.js";

describe("maxNotionCount — the upper bound grows with the document", () => {
  it("stays at 60 for a document up to 30 000 characters", () => {
    expect(maxNotionCount(0)).toBe(60);
    expect(maxNotionCount(30_000)).toBe(60);
  });

  it("allows one notion per 500 characters beyond that", () => {
    expect(maxNotionCount(30_001)).toBe(61);
    expect(maxNotionCount(65_399)).toBe(131);
  });
});

describe("isValidNotionCount with the document length", () => {
  it("accepts a dense 65 000-character course's 131 notions, not 132", () => {
    expect(isValidNotionCount(131, 65_399)).toBe(true);
    expect(isValidNotionCount(132, 65_399)).toBe(false);
  });

  it("keeps the floor at 5 however long the document", () => {
    expect(isValidNotionCount(4, 65_399)).toBe(false);
    expect(isValidNotionCount(5, 65_399)).toBe(true);
  });
});
