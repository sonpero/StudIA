import { describe, expect, it } from "vitest";
import { renumberContiguously } from "./position.js";

describe("renumberContiguously", () => {
  it("assigns 0-based contiguous positions in the given order", () => {
    expect(renumberContiguously(["a", "b", "c"])).toEqual([
      { id: "a", position: 0 },
      { id: "b", position: 1 },
      { id: "c", position: 2 },
    ]);
  });

  it("reflects a full reversal of the list", () => {
    expect(renumberContiguously(["c", "b", "a"])).toEqual([
      { id: "c", position: 0 },
      { id: "b", position: 1 },
      { id: "a", position: 2 },
    ]);
  });

  it("closes the gap left by removing an id from the middle", () => {
    // e.g. deleting "b" from [a, b, c]: renumber the survivors in order.
    expect(renumberContiguously(["a", "c"])).toEqual([
      { id: "a", position: 0 },
      { id: "c", position: 1 },
    ]);
  });

  it("returns an empty list for no ids", () => {
    expect(renumberContiguously([])).toEqual([]);
  });
});
