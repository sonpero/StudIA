import { describe, expect, it } from "vitest";
import { fakeReviewRepository } from "./fakes.js";
import { getDueCards } from "./get-due-cards.js";
import type { DueCard } from "../domain/due-card.js";

const now = new Date("2026-01-05T00:00:00.000Z");

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

    const cards = await getDueCards({ repo }, "u1", now, { documentId: "doc-1", notionId: "n1", limit: 10 });

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

    const cards = await getDueCards({ repo }, "u1", now, {});

    expect(cards[0]?.mastered).toBe(true);
  });
});
