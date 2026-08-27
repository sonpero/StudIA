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

    const cards = await getDueCards({ repo }, "u1", now, { documentId: "doc-1", limit: 10 });

    expect(cards).toEqual([aDueCard()]);
  });
});
