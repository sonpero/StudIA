import { describe, expect, it } from "vitest";
import { notionBudgets } from "./notion-budget.js";

const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);

describe("notionBudgets — the most notions each chunk may yield, shared out from the document's cap", () => {
  it("gives a lone chunk the whole cap", () => {
    expect(notionBudgets([65_000], 131)).toEqual([131]);
  });

  it("shares the cap in proportion to each chunk's length", () => {
    // One notion reserved per chunk, the other 58 split 1:3.
    expect(notionBudgets([1_000, 3_000], 60)).toEqual([16, 44]);
  });

  it("uses the whole cap and never more: A2A's nine chunks and its cap of 131", () => {
    const lengths = [7_006, 7_120, 7_593, 7_300, 7_250, 7_411, 7_388, 7_190, 7_141];
    const budgets = notionBudgets(lengths, 131);

    expect(sum(budgets)).toBe(131);
    for (const budget of budgets) expect(budget).toBeGreaterThanOrEqual(14);
    for (const budget of budgets) expect(budget).toBeLessThanOrEqual(15);
    // The longest chunk is never budgeted below a shorter one.
    expect(budgets[2]).toBe(Math.max(...budgets));
  });

  it("never leaves a chunk at zero when the cap covers every chunk", () => {
    expect(notionBudgets([100, 100_000], 60)).toEqual([1, 59]);
  });

  it("still never exceeds the cap when there are more chunks than the cap allows", () => {
    const budgets = notionBudgets([10, 10, 10], 2);
    expect(sum(budgets)).toBe(2);
    expect(budgets).toEqual([1, 1, 0]);
    // No notion reserved per chunk then: the longer chunk gets the only one.
    expect(notionBudgets([1, 3], 1)).toEqual([0, 1]);
  });

  it("breaks remainder ties in chunk order, so the same inputs always give the same budgets", () => {
    expect(notionBudgets([1, 1, 1], 5)).toEqual([2, 2, 1]);
    expect(notionBudgets([1, 1, 1], 5)).toEqual(notionBudgets([1, 1, 1], 5));
  });

  it("sums exactly to the cap across a spread of shapes", () => {
    const shapes: [number[], number][] = [
      [[3, 7, 11, 13], 60],
      [[9_999, 1, 1, 1, 1], 97],
      [[4_000, 4_000, 4_000], 60],
      [[12_345, 6_789, 2_222, 15_000, 800], 75],
    ];
    for (const [lengths, cap] of shapes) expect(sum(notionBudgets(lengths, cap))).toBe(cap);
  });

  it("gives one notion to every chunk when the cap exactly covers them, however unequal", () => {
    expect(notionBudgets([1, 100], 2)).toEqual([1, 1]);
  });

  it("shares evenly between chunks of no length rather than failing", () => {
    expect(notionBudgets([0, 0], 4)).toEqual([2, 2]);
  });

  it("returns no budget for no chunk", () => {
    expect(notionBudgets([], 60)).toEqual([]);
  });
});
