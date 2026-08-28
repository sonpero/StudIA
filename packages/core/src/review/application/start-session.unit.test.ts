import { describe, expect, it } from "vitest";
import { uuidV7Generator } from "../../shared/index.js";
import { fakeReviewRepository } from "./fakes.js";
import { startSession } from "./start-session.js";
import type { DueCard } from "../domain/due-card.js";

const now = new Date("2026-01-01T00:00:00.000Z");

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
  it("creates a session row and draws its due cards", async () => {
    const repo = fakeReviewRepository({ dueCards: [aDueCard()] });

    const result = await startSession({ repo, idGenerator: uuidV7Generator }, "u1", now, { documentId: "doc-1" });

    expect(result.sessionId).toBeTruthy();
    expect(result.cards).toEqual([{ ...aDueCard(), mastered: false }]);
    expect(repo.sessions).toEqual([
      expect.objectContaining({ userId: "u1", documentId: "doc-1", startedAt: now.toISOString(), endedAt: null }) as unknown,
    ]);
  });

  it("accepts a notionId filter, to review a single notion", async () => {
    const repo = fakeReviewRepository({ dueCards: [aDueCard()] });

    const result = await startSession({ repo, idGenerator: uuidV7Generator }, "u1", now, { documentId: "doc-1", notionId: "n1" });

    expect(result.cards).toEqual([{ ...aDueCard(), mastered: false }]);
  });
});
