import { describe, expect, it } from "vitest";
import { isMastered, MASTERY_REPS_THRESHOLD, MASTERY_STABILITY_DAYS_THRESHOLD } from "./mastery.js";
import type { CardSchedule } from "./types.js";

function aSchedule(overrides: Partial<CardSchedule> = {}): CardSchedule {
  return {
    cardId: "c1",
    userId: "u1",
    due: "2026-02-01T00:00:00.000Z",
    stability: MASTERY_STABILITY_DAYS_THRESHOLD,
    difficulty: 3,
    reps: MASTERY_REPS_THRESHOLD,
    lapses: 0,
    lastReviewedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("isMastered", () => {
  it("is mastered exactly at the threshold on both dimensions", () => {
    expect(isMastered(aSchedule())).toBe(true);
  });

  it("is not mastered just under the stability threshold", () => {
    expect(isMastered(aSchedule({ stability: MASTERY_STABILITY_DAYS_THRESHOLD - 0.01 }))).toBe(false);
  });

  it("is not mastered just under the reps threshold", () => {
    expect(isMastered(aSchedule({ reps: MASTERY_REPS_THRESHOLD - 1 }))).toBe(false);
  });

  it("is mastered well above both thresholds", () => {
    expect(isMastered(aSchedule({ stability: 90, reps: 10 }))).toBe(true);
  });
});
