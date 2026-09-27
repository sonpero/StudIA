import { describe, expect, it } from "vitest";
import { maxNotionCount } from "./is-valid-notion-count.js";
import { notionCountTarget } from "./notion-count-target.js";

describe("notionCountTarget — how many notions the model is asked to aim for in one chunk", () => {
  it("asks for one notion per 600 to 1 000 characters of a chunk", () => {
    // A2A's chunks are ~7 300 characters each.
    expect(notionCountTarget(7_300, { onlyChunk: false })).toEqual({ min: 8, max: 13 });
    expect(notionCountTarget(10_000, { onlyChunk: false })).toEqual({ min: 10, max: 17 });
  });

  it("asks for at least one notion from a small trailing chunk", () => {
    expect(notionCountTarget(400, { onlyChunk: false })).toEqual({ min: 1, max: 1 });
  });

  it("never asks a whole-document chunk for fewer than the document's 5-notion floor", () => {
    expect(notionCountTarget(2_000, { onlyChunk: true })).toEqual({ min: 5, max: 5 });
    expect(notionCountTarget(12_000, { onlyChunk: true })).toEqual({ min: 12, max: 20 });
  });

  it("keeps the targets of a long document's chunks under its length-proportional cap", () => {
    // Nine A2A-sized chunks: the summed upper targets stay below the cap
    // handle-split-job validates against, so a model that follows the
    // target is never rejected for being too fine-grained.
    const chunkLengths = Array.from({ length: 9 }, () => 7_300);
    const summedMax = chunkLengths.reduce((sum, length) => sum + notionCountTarget(length, { onlyChunk: false }).max, 0);
    expect(summedMax).toBe(117);
    expect(summedMax).toBeLessThanOrEqual(maxNotionCount(9 * 7_300));
  });
});
