import { describe, expect, it } from "vitest";
import { systemClock } from "./clock.js";

describe("systemClock", () => {
  it("returns a Date close to the real current time", () => {
    const before = Date.now();
    const now = systemClock.now();
    const after = Date.now();

    expect(now.getTime()).toBeGreaterThanOrEqual(before);
    expect(now.getTime()).toBeLessThanOrEqual(after);
  });
});
