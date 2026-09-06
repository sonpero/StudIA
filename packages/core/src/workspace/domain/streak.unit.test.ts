import { describe, expect, it } from "vitest";
import { computeStreak } from "./streak.js";

const NOW = new Date("2026-03-10T14:00:00.000Z"); // a Tuesday, mid-afternoon UTC

describe("computeStreak", () => {
  it("is 0 with no activity at all", () => {
    expect(computeStreak([], NOW)).toBe(0);
  });

  it("is 1 with activity only today", () => {
    expect(computeStreak(["2026-03-10"], NOW)).toBe(1);
  });

  it("counts today and every unbroken day before it", () => {
    expect(computeStreak(["2026-03-10", "2026-03-09", "2026-03-08"], NOW)).toBe(3);
  });

  // docs/MILESTONES.md's M9 acceptance: "activity today is not required to
  // keep yesterday's count" — the person hasn't reviewed yet today, but the
  // streak they're on shouldn't read as already broken.
  it("counts from yesterday when today has no activity yet", () => {
    expect(computeStreak(["2026-03-09", "2026-03-08"], NOW)).toBe(2);
  });

  // The other half of the same rule: yesterday itself must have been hit,
  // not just "sometime recently" — two days with no activity is a broken
  // streak, not a grace period.
  it("is 0 when the most recent activity was two or more days ago", () => {
    expect(computeStreak(["2026-03-07"], NOW)).toBe(0);
  });

  // docs/MILESTONES.md's M9 acceptance: "a gap of a full calendar day with
  // no activity, anywhere before yesterday, caps the count at the run
  // ending closest to now" — the older run (03-05..03-07) must never be
  // added to the current one just because it's also in the input.
  it("stops at the first gap looking backward, ignoring any older run beyond it", () => {
    const days = ["2026-03-10", "2026-03-09", "2026-03-07", "2026-03-06", "2026-03-05"];
    expect(computeStreak(days, NOW)).toBe(2);
  });

  it("is deterministic: repeated calls with the same input agree", () => {
    const days = ["2026-03-10", "2026-03-09"];
    expect(computeStreak(days, NOW)).toBe(computeStreak(days, NOW));
  });

  it("does not depend on input order or on duplicate entries", () => {
    const ordered = ["2026-03-08", "2026-03-09", "2026-03-10"];
    const shuffled = ["2026-03-10", "2026-03-10", "2026-03-08", "2026-03-09"];
    expect(computeStreak(shuffled, NOW)).toBe(computeStreak(ordered, NOW));
  });
});
