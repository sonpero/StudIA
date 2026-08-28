import { describe, expect, it } from "vitest";
import { isMastered, MASTERY_REPS_THRESHOLD, MASTERY_STABILITY_DAYS_THRESHOLD, withMastery } from "./mastery.js";
import type { DueCard } from "./due-card.js";
import type { CardSchedule } from "./types.js";

function aDueCard(overrides: Partial<DueCard> = {}): DueCard {
  return {
    cardId: "c1",
    notionId: "n1",
    type: "flashcard",
    state: "active",
    question: "Q ?",
    answer: "R",
    options: null,
    schedule: null,
    ...overrides,
  };
}

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

describe("withMastery", () => {
  it("marks a never-reviewed card (no schedule) as not mastered", () => {
    expect(withMastery(aDueCard({ schedule: null })).mastered).toBe(false);
  });

  it("marks a card mastered when its schedule clears the threshold", () => {
    expect(withMastery(aDueCard({ schedule: aSchedule() })).mastered).toBe(true);
  });

  it("marks a card not mastered when its schedule is under the threshold", () => {
    expect(withMastery(aDueCard({ schedule: aSchedule({ reps: MASTERY_REPS_THRESHOLD - 1 }) })).mastered).toBe(false);
  });

  it("keeps every other field on the card unchanged", () => {
    const card = aDueCard({ schedule: aSchedule() });
    expect(withMastery(card)).toEqual({ ...card, mastered: true });
  });
});
