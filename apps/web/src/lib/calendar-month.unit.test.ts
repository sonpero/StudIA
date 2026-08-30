import { describe, expect, it } from "vitest";
import { buildMonthGrid, monthLabel, monthRange } from "./calendar-month.js";

describe("monthRange", () => {
  it("returns the first and last day of the given month as inclusive ISO date keys", () => {
    expect(monthRange(2026, 2)).toEqual({ start: "2026-03-01", end: "2026-03-31" });
  });

  it("gets a 30-day month's end right, not just 31-day ones", () => {
    expect(monthRange(2026, 3)).toEqual({ start: "2026-04-01", end: "2026-04-30" });
  });

  it("gets February right in a non-leap year", () => {
    expect(monthRange(2026, 1)).toEqual({ start: "2026-02-01", end: "2026-02-28" });
  });

  it("gets February right in a leap year", () => {
    expect(monthRange(2028, 1)).toEqual({ start: "2028-02-01", end: "2028-02-29" });
  });
});

describe("monthLabel", () => {
  it("formats a month and year in French, capitalised", () => {
    expect(monthLabel(2026, 2)).toBe("Mars 2026");
  });
});

describe("buildMonthGrid", () => {
  it("returns a whole number of weeks, every entry a valid date key", () => {
    const grid = buildMonthGrid(2026, 2); // March 2026
    expect(grid.length % 7).toBe(0);
    for (const day of grid) expect(day.dateKey).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("marks every day of the browsed month as in-month", () => {
    const grid = buildMonthGrid(2026, 2);
    const inMonthKeys = grid.filter((d) => d.inMonth).map((d) => d.dateKey);
    expect(inMonthKeys[0]).toBe("2026-03-01");
    expect(inMonthKeys[inMonthKeys.length - 1]).toBe("2026-03-31");
    expect(inMonthKeys).toHaveLength(31);
  });

  // 2026-03-01 is a Sunday: a Monday-first grid needs six leading days from
  // February to complete that first week.
  it("fills the leading week with the previous month's trailing days, marked out of month", () => {
    const grid = buildMonthGrid(2026, 2);
    const leading = grid.slice(0, grid.findIndex((d) => d.inMonth));

    expect(leading.every((d) => !d.inMonth)).toBe(true);
    expect(leading.map((d) => d.dateKey)).toEqual(["2026-02-23", "2026-02-24", "2026-02-25", "2026-02-26", "2026-02-27", "2026-02-28"]);
  });

  // 2026-03-31 is a Tuesday: the trailing week needs April's first five
  // days to complete it.
  it("fills the trailing week with the next month's leading days, marked out of month", () => {
    const grid = buildMonthGrid(2026, 2);
    const lastInMonthIndex = grid.map((d) => d.inMonth).lastIndexOf(true);
    const trailing = grid.slice(lastInMonthIndex + 1);

    expect(trailing.every((d) => !d.inMonth)).toBe(true);
    expect(trailing.map((d) => d.dateKey)).toEqual(["2026-04-01", "2026-04-02", "2026-04-03", "2026-04-04", "2026-04-05"]);
  });

  it("crosses a year boundary correctly (December into January)", () => {
    const grid = buildMonthGrid(2026, 11); // December 2026
    const inMonthKeys = grid.filter((d) => d.inMonth).map((d) => d.dateKey);
    expect(inMonthKeys[0]).toBe("2026-12-01");
    expect(inMonthKeys[inMonthKeys.length - 1]).toBe("2026-12-31");
  });
});
