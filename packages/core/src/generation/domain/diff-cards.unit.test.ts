import { describe, expect, it } from "vitest";
import { diffCards } from "./diff-cards.js";
import type { Card, GeneratedCard } from "./types.js";

const now = new Date("2026-01-01T00:00:00.000Z");

function aCard(overrides: Partial<Card> = {}): Card {
  return {
    id: "c1",
    notionId: "n1",
    userId: "u1",
    type: "flashcard",
    state: "active",
    question: "Question A ?",
    answer: "Réponse A",
    options: null,
    createdAt: now.toISOString(),
    ...overrides,
  };
}

function aGenerated(overrides: Partial<GeneratedCard> = {}): GeneratedCard {
  return { type: "flashcard", question: "Question A ?", answer: "Réponse A", options: null, ...overrides };
}

describe("diffCards", () => {
  it("inserts every generated card when there is nothing existing yet", () => {
    const { actions, deleteIds } = diffCards([], [aGenerated()]);

    expect(actions).toEqual([{ action: "insert", generated: aGenerated() }]);
    expect(deleteIds).toEqual([]);
  });

  it("keeps the existing id when a generated card's (type, question) is unchanged — this protects review history", () => {
    const { actions, deleteIds } = diffCards([aCard({ id: "c1" })], [aGenerated()]);

    expect(actions).toEqual([{ action: "keep", id: "c1", generated: aGenerated() }]);
    expect(deleteIds).toEqual([]);
  });

  it("deletes an existing card whose question no longer appears in the regenerated set", () => {
    const { actions, deleteIds } = diffCards([aCard({ id: "c1", question: "Question disparue ?" })], []);

    expect(actions).toEqual([]);
    expect(deleteIds).toEqual(["c1"]);
  });

  it("a changed question is a delete of the old card plus an insert of the new one", () => {
    const { actions, deleteIds } = diffCards(
      [aCard({ id: "c1", question: "Ancienne question ?" })],
      [aGenerated({ question: "Nouvelle question ?" })],
    );

    expect(actions).toEqual([{ action: "insert", generated: aGenerated({ question: "Nouvelle question ?" }) }]);
    expect(deleteIds).toEqual(["c1"]);
  });

  it("matches by (type, question) independently: same question, different type is not a match", () => {
    const { actions, deleteIds } = diffCards(
      [aCard({ id: "c1", type: "flashcard", question: "Question A ?" })],
      [aGenerated({ type: "mcq", question: "Question A ?" })],
    );

    expect(actions).toEqual([{ action: "insert", generated: aGenerated({ type: "mcq", question: "Question A ?" }) }]);
    expect(deleteIds).toEqual(["c1"]);
  });

  it("a realistic mix: one kept, one deleted, one inserted", () => {
    const kept = aCard({ id: "keep-me", question: "Question stable ?" });
    const toDelete = aCard({ id: "delete-me", question: "Question obsolète ?" });
    const generated = [aGenerated({ question: "Question stable ?" }), aGenerated({ question: "Question nouvelle ?" })];

    const { actions, deleteIds } = diffCards([kept, toDelete], generated);

    expect(actions).toEqual([
      { action: "keep", id: "keep-me", generated: aGenerated({ question: "Question stable ?" }) },
      { action: "insert", generated: aGenerated({ question: "Question nouvelle ?" }) },
    ]);
    expect(deleteIds).toEqual(["delete-me"]);
  });
});
