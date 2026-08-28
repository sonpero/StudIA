import { afterEach, describe, expect, it, vi } from "vitest";
import { startOfTomorrowISO, todayDateKey } from "./day-boundary.js";

describe("startOfTomorrowISO", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns local midnight of the day after the given instant, as an ISO string", () => {
    // Local-time constructor, not a fixed UTC string: the boundary must be
    // "tomorrow" in the machine's own timezone, not a hardcoded offset.
    const now = new Date(2026, 7, 28, 15, 30, 0);

    const result = startOfTomorrowISO(now);

    const expected = new Date(2026, 7, 29, 0, 0, 0, 0);
    expect(result).toBe(expected.toISOString());
  });

  it("crosses a month boundary correctly", () => {
    const now = new Date(2026, 0, 31, 23, 0, 0);

    const result = startOfTomorrowISO(now);

    expect(result).toBe(new Date(2026, 1, 1, 0, 0, 0, 0).toISOString());
  });

  it("defaults to the real current time when no instant is given", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 7, 28, 10, 0, 0));

    expect(startOfTomorrowISO()).toBe(new Date(2026, 7, 29, 0, 0, 0, 0).toISOString());
  });
});

describe("todayDateKey", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns the local calendar date as YYYY-MM-DD, not an instant", () => {
    const now = new Date(2026, 7, 28, 23, 59, 0);
    expect(todayDateKey(now)).toBe("2026-08-28");
  });

  it("zero-pads single-digit months and days", () => {
    const now = new Date(2026, 0, 5, 0, 0, 0);
    expect(todayDateKey(now)).toBe("2026-01-05");
  });

  it("defaults to the real current time when no instant is given", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 7, 28, 10, 0, 0));

    expect(todayDateKey()).toBe("2026-08-28");
  });
});
