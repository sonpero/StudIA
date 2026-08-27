import { describe, expect, it } from "vitest";
import { fakeCardRepository } from "./fakes.js";
import { listCards } from "./list-cards.js";
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

describe("listCards", () => {
  it("lists only the caller's cards for that notion", async () => {
    const repo = fakeCardRepository([aCard({ id: "c1" }), aCard({ id: "c2", userId: "u2" })]);

    expect((await listCards({ repo }, "u1", "n1")).map((c) => c.id)).toEqual(["c1"]);
  });
});
