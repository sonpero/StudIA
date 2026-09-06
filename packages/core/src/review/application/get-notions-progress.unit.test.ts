import { describe, expect, it, vi } from "vitest";
import { fakeReviewRepository } from "./fakes.js";
import { getNotionsProgress } from "./get-notions-progress.js";

const DAY_BOUNDARY = new Date("2026-01-02T00:00:00.000Z");

describe("getNotionsProgress", () => {
  it("returns the per-notion mastered/total card counts from the repository, enriched with reps and nextDueDate", async () => {
    const repo = fakeReviewRepository();
    repo.getNotionsProgress = vi.fn().mockResolvedValue([
      { notionId: "n1", masteredCards: 2, totalCards: 3, cardsWithEnoughReps: 2, cardsWithEnoughStability: 3 },
      { notionId: "n2", masteredCards: 0, totalCards: 0, cardsWithEnoughReps: 0, cardsWithEnoughStability: 0 },
    ]);
    repo.getCardSchedulesForDocument = vi.fn().mockResolvedValue([
      { notionId: "n1", cardId: "c1", schedule: { cardId: "c1", userId: "u1", due: "2026-01-10T00:00:00.000Z", stability: 25, difficulty: 3, reps: 5, lapses: 0, lastReviewedAt: null } },
      { notionId: "n1", cardId: "c2", schedule: { cardId: "c2", userId: "u1", due: "2026-01-05T00:00:00.000Z", stability: 25, difficulty: 3, reps: 3, lapses: 0, lastReviewedAt: null } },
    ]);

    expect(await getNotionsProgress({ repo }, "u1", "doc-1", DAY_BOUNDARY)).toEqual([
      { notionId: "n1", masteredCards: 2, totalCards: 3, cardsWithEnoughReps: 2, cardsWithEnoughStability: 3, reps: 8, nextDueDate: "2026-01-05T00:00:00.000Z", dueNow: false },
      { notionId: "n2", masteredCards: 0, totalCards: 0, cardsWithEnoughReps: 0, cardsWithEnoughStability: 0, reps: 0, nextDueDate: null, dueNow: false },
    ]);
  });

  it("a card that's already due (before dayBoundary) never counts as an upcoming nextDueDate, but does make the notion dueNow — its reps still count", async () => {
    const repo = fakeReviewRepository();
    repo.getNotionsProgress = vi.fn().mockResolvedValue([{ notionId: "n1", masteredCards: 0, totalCards: 1, cardsWithEnoughReps: 0, cardsWithEnoughStability: 0 }]);
    repo.getCardSchedulesForDocument = vi.fn().mockResolvedValue([
      { notionId: "n1", cardId: "c1", schedule: { cardId: "c1", userId: "u1", due: "2026-01-01T00:00:00.000Z", stability: 2, difficulty: 5, reps: 1, lapses: 0, lastReviewedAt: null } },
    ]);

    const [notion] = await getNotionsProgress({ repo }, "u1", "doc-1", DAY_BOUNDARY);

    expect(notion).toEqual({ notionId: "n1", masteredCards: 0, totalCards: 1, cardsWithEnoughReps: 0, cardsWithEnoughStability: 0, reps: 1, nextDueDate: null, dueNow: true });
  });

  it("a card never reviewed (schedule null) contributes no reps and no nextDueDate, but is dueNow — same rule getDueCards' own SQL applies (due IS NULL OR due < dayBoundary)", async () => {
    const repo = fakeReviewRepository();
    repo.getNotionsProgress = vi.fn().mockResolvedValue([{ notionId: "n1", masteredCards: 0, totalCards: 1, cardsWithEnoughReps: 0, cardsWithEnoughStability: 0 }]);
    repo.getCardSchedulesForDocument = vi.fn().mockResolvedValue([{ notionId: "n1", cardId: "c1", schedule: null }]);

    const [notion] = await getNotionsProgress({ repo }, "u1", "doc-1", DAY_BOUNDARY);

    expect(notion).toEqual({ notionId: "n1", masteredCards: 0, totalCards: 1, cardsWithEnoughReps: 0, cardsWithEnoughStability: 0, reps: 0, nextDueDate: null, dueNow: true });
  });
});
