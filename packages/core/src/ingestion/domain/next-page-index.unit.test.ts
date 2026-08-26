import { describe, expect, it } from "vitest";
import { nextPageIndex } from "./next-page-index.js";

describe("nextPageIndex", () => {
  it("returns 0 for the first page of a document", () => {
    expect(nextPageIndex([])).toBe(0);
  });

  it("returns the next contiguous index", () => {
    expect(nextPageIndex([0, 1, 2])).toBe(3);
  });

  it("is based on count, not the max index (gapless ordering is an invariant, not re-derived)", () => {
    expect(nextPageIndex([0, 1])).toBe(2);
  });
});
