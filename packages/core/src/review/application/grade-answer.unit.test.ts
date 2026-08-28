import { describe, expect, it } from "vitest";
import { err, ok } from "../../shared/index.js";
import type { Card } from "../../generation/index.js";
import { fakeAnswerGrader, fakeCardRepositoryForReview } from "./fakes.js";
import { gradeAnswer } from "./grade-answer.js";

function anOpenCard(overrides: Partial<Card> = {}): Card {
  return {
    id: "c1",
    notionId: "n1",
    userId: "u1",
    type: "open",
    state: "active",
    question: "Explique le rôle de la chlorophylle.",
    answer: "Elle capte la lumière pour la photosynthèse.",
    options: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function anMcqCard(overrides: Partial<Card> = {}): Card {
  return {
    id: "c1",
    notionId: "n1",
    userId: "u1",
    type: "mcq",
    state: "active",
    question: "Quel gaz la photosynthèse libère-t-elle ?",
    answer: "Oxygène",
    options: ["Oxygène", "Azote", "Hydrogène", "Chlore"],
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("gradeAnswer — open cards", () => {
  it("fetches the card, then calls the grader outside any transaction, and returns its verdict", async () => {
    const cardRepo = fakeCardRepositoryForReview([anOpenCard()]);
    let receivedInput: unknown;
    const grader = fakeAnswerGrader((input) => {
      receivedInput = input;
      return Promise.resolve(ok({ correct: true, feedback: "Exact.", suggestedRating: 3 }));
    });

    const result = await gradeAnswer({ cardRepo, grader }, "u1", "c1", "Elle transforme la lumière en énergie.");

    expect(result).toEqual({ ok: true, value: { correct: true, feedback: "Exact.", suggestedRating: 3 } });
    expect(receivedInput).toEqual({
      question: "Explique le rôle de la chlorophylle.",
      expected: "Elle capte la lumière pour la photosynthèse.",
      given: "Elle transforme la lumière en énergie.",
    });
  });

  it("surfaces a grader error", async () => {
    const cardRepo = fakeCardRepositoryForReview([anOpenCard()]);
    const grader = fakeAnswerGrader(() => Promise.resolve(err({ kind: "model-error", message: "boom" })));

    const result = await gradeAnswer({ cardRepo, grader }, "u1", "c1", "given");

    expect(result).toEqual({ ok: false, error: { kind: "model-error", message: "boom" } });
  });
});

describe("gradeAnswer — mcq cards", () => {
  // The whole point of this suite: the server is the single source of
  // truth for the rating, reusing domain/grade-mcq.ts — never the LLM
  // port (mcq is exact-match, docs/modules/review.md), never trusting a
  // client-computed verdict.
  it("grades a correct option server-side via grade-mcq.ts, without calling the LLM grader", async () => {
    const cardRepo = fakeCardRepositoryForReview([anMcqCard()]);
    let llmGraderCalled = false;
    const grader = fakeAnswerGrader(() => {
      llmGraderCalled = true;
      return Promise.resolve(ok({ correct: false, feedback: "should never be used", suggestedRating: 1 }));
    });

    const result = await gradeAnswer({ cardRepo, grader }, "u1", "c1", "Oxygène");

    expect(result).toEqual({ ok: true, value: { correct: true, feedback: "Correct.", suggestedRating: 3 } });
    expect(llmGraderCalled).toBe(false);
  });

  it("grades an incorrect option server-side, revealing the correct answer in the feedback", async () => {
    const cardRepo = fakeCardRepositoryForReview([anMcqCard()]);
    const grader = fakeAnswerGrader();

    const result = await gradeAnswer({ cardRepo, grader }, "u1", "c1", "Azote");

    expect(result).toEqual({ ok: true, value: { correct: false, feedback: "Incorrect. La bonne réponse était : Oxygène", suggestedRating: 1 } });
  });

  it("tolerates whitespace/case differences the same way domain/grade-mcq.ts does", async () => {
    const cardRepo = fakeCardRepositoryForReview([anMcqCard()]);
    const grader = fakeAnswerGrader();

    const result = await gradeAnswer({ cardRepo, grader }, "u1", "c1", " oxygène ");

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.correct).toBe(true);
  });
});

describe("gradeAnswer — shared behaviour", () => {
  it("returns not-found for a card that doesn't belong to the user", async () => {
    const cardRepo = fakeCardRepositoryForReview([anOpenCard()]);
    const grader = fakeAnswerGrader();

    const result = await gradeAnswer({ cardRepo, grader }, "u2", "c1", "given");

    expect(result).toEqual({ ok: false, error: "not-found" });
  });

  it("refuses to grade a flashcard: it is self-rated, never graded (docs/modules/review.md)", async () => {
    const cardRepo = fakeCardRepositoryForReview([anOpenCard({ type: "flashcard" })]);
    const grader = fakeAnswerGrader();

    const result = await gradeAnswer({ cardRepo, grader }, "u1", "c1", "given");

    expect(result).toEqual({ ok: false, error: "wrong-type" });
  });
});
