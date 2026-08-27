import { describe, expect, it } from "vitest";
import { fakeCardRepository } from "./fakes.js";
import { markStale } from "./mark-stale.js";
import type { Card } from "../domain/types.js";

const now = new Date("2026-01-01T00:00:00.000Z");

function aCard(overrides: Partial<Card> = {}): Card {
  return {
    id: "c1",
    notionId: "n1",
    userId: "u1",
    type: "flashcard",
    state: "active",
    question: "Q ?",
    answer: "R",
    options: null,
    createdAt: now.toISOString(),
    ...overrides,
  };
}

describe("markStale", () => {
  it("flips every active card of the notion to stale, for the caller only", async () => {
    const repo = fakeCardRepository([aCard({ id: "c1" }), aCard({ id: "c2", userId: "u2" })]);

    await markStale({ repo }, "u1", "n1");

    expect(repo.cards.find((c) => c.id === "c1")?.state).toBe("stale");
    expect(repo.cards.find((c) => c.id === "c2")?.state).toBe("active");
  });
});
