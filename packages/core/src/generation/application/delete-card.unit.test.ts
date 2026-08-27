import { describe, expect, it } from "vitest";
import { fakeCardRepository } from "./fakes.js";
import { deleteCard } from "./delete-card.js";
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

describe("deleteCard", () => {
  it("deletes the caller's card", async () => {
    const repo = fakeCardRepository([aCard()]);

    expect(await deleteCard({ repo }, "u1", "c1")).toEqual({ ok: true, value: undefined });
    expect(repo.cards).toHaveLength(0);
  });

  it("rejects another user's card", async () => {
    const repo = fakeCardRepository([aCard({ userId: "someone-else" })]);

    expect(await deleteCard({ repo }, "u1", "c1")).toEqual({ ok: false, error: "not-found" });
    expect(repo.cards).toHaveLength(1);
  });
});
