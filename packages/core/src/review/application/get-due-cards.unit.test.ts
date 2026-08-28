import { describe, expect, it } from "vitest";
import { fakeReviewRepository } from "./fakes.js";
import { getDueCards } from "./get-due-cards.js";
import type { DueCard } from "../domain/due-card.js";

const dayBoundary = new Date("2026-01-05T00:00:00.000Z");

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

describe("getDueCards", () => {
  it("passes the clock and filter through to the repository", async () => {
    const repo = fakeReviewRepository({ dueCards: [aDueCard()] });

    const cards = await getDueCards({ repo }, "u1", dayBoundary, { documentId: "doc-1", notionId: "n1", limit: 10 });

    expect(cards).toEqual([{ ...aDueCard(), mastered: false }]);
  });

  it("enriches each card with mastered, computed from its schedule", async () => {
    const masteredSchedule = {
      cardId: "c1",
      userId: "u1",
      due: "2026-01-01T00:00:00.000Z",
      stability: 30,
      difficulty: 3,
      reps: 5,
      lapses: 0,
      lastReviewedAt: "2025-12-01T00:00:00.000Z",
    };
    const repo = fakeReviewRepository({ dueCards: [aDueCard({ schedule: masteredSchedule })] });

    const cards = await getDueCards({ repo }, "u1", dayBoundary, {});

    expect(cards[0]?.mastered).toBe(true);
  });

  it("includes a card due before dayBoundary (later today), excludes one due at or after it (tomorrow)", async () => {
    const dueLaterToday = aDueCard({
      cardId: "today",
      schedule: { cardId: "today", userId: "u1", due: new Date(dayBoundary.getTime() - 1).toISOString(), stability: 2, difficulty: 3, reps: 1, lapses: 0, lastReviewedAt: null },
    });
    const dueTomorrow = aDueCard({
      cardId: "tomorrow",
      schedule: { cardId: "tomorrow", userId: "u1", due: dayBoundary.toISOString(), stability: 2, difficulty: 3, reps: 1, lapses: 0, lastReviewedAt: null },
    });
    const repo = fakeReviewRepository({ dueCards: [dueLaterToday, dueTomorrow] });

    const cards = await getDueCards({ repo }, "u1", dayBoundary, {});

    expect(cards.map((c) => c.cardId)).toEqual(["today"]);
  });
});
