import { describe, expect, it } from "vitest";
import { uuidV7Generator } from "../../shared/index.js";
import { fakeReviewRepository } from "./fakes.js";
import { startSession } from "./start-session.js";
import type { DueCard } from "../domain/due-card.js";

const now = new Date("2026-01-01T00:00:00.000Z");
const dayBoundary = new Date("2026-01-02T00:00:00.000Z");

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

describe("startSession", () => {
  it("creates a session row stamped with the real clock, and draws its due cards using the day boundary", async () => {
    const repo = fakeReviewRepository({ dueCards: [aDueCard()] });

    const result = await startSession({ repo, idGenerator: uuidV7Generator }, "u1", now, dayBoundary, { documentId: "doc-1" });

    expect(result.sessionId).toBeTruthy();
    expect(result.cards).toEqual([{ ...aDueCard(), mastered: false }]);
    // startedAt uses `now` (the real clock), never dayBoundary — the two
    // must not be conflated (submitReview's FSRS clock is a separate thing
    // entirely from the due-ness threshold).
    expect(repo.sessions).toEqual([
      expect.objectContaining({ userId: "u1", documentId: "doc-1", startedAt: now.toISOString(), endedAt: null }) as unknown,
    ]);
  });

  it("accepts a notionId filter, to review a single notion", async () => {
    const repo = fakeReviewRepository({ dueCards: [aDueCard()] });

    const result = await startSession({ repo, idGenerator: uuidV7Generator }, "u1", now, dayBoundary, { documentId: "doc-1", notionId: "n1" });

    expect(result.cards).toEqual([{ ...aDueCard(), mastered: false }]);
  });

  it("draws cards due later today (before dayBoundary), not just already-past-due ones", async () => {
    const dueLaterToday = aDueCard({
      schedule: { cardId: "c1", userId: "u1", due: new Date(dayBoundary.getTime() - 1).toISOString(), stability: 2, difficulty: 3, reps: 1, lapses: 0, lastReviewedAt: null },
    });
    const repo = fakeReviewRepository({ dueCards: [dueLaterToday] });

    const result = await startSession({ repo, idGenerator: uuidV7Generator }, "u1", now, dayBoundary, {});

    expect(result.cards.map((c) => c.cardId)).toEqual(["c1"]);
  });
});
