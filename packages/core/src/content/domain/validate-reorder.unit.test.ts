import { describe, expect, it } from "vitest";
import { validateReorder } from "./validate-reorder.js";

describe("validateReorder", () => {
  it("accepts a proposed order that is a permutation of the current ids", () => {
    expect(validateReorder(["a", "b", "c"], ["c", "a", "b"])).toEqual({ ok: true, value: ["c", "a", "b"] });
  });

  it("rejects a partial list missing an existing id", () => {
    expect(validateReorder(["a", "b", "c"], ["c", "a"])).toEqual({ ok: false, error: "partial-list" });
  });

  it("rejects a list containing an id that does not belong to this document", () => {
    expect(validateReorder(["a", "b"], ["a", "b", "ghost"])).toEqual({ ok: false, error: "partial-list" });
  });

  it("rejects a list with a duplicated id", () => {
    expect(validateReorder(["a", "b"], ["a", "a"])).toEqual({ ok: false, error: "partial-list" });
  });
});
