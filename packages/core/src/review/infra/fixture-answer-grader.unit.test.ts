import { describe, expect, it } from "vitest";
import { FixtureAnswerGrader } from "./fixture-answer-grader.js";

const input = { question: "Explique le rôle de la chlorophylle.", expected: "Elle capte la lumière pour la photosynthèse.", given: "some answer" };

describe("FixtureAnswerGrader", () => {
  it("correct: marks correct, suggests good(3)", async () => {
    const grader = new FixtureAnswerGrader("correct");
    const result = await grader.grade(input);
    expect(result).toEqual({ ok: true, value: { correct: true, feedback: expect.any(String) as string, suggestedRating: 3 } });
  });

  // The key contract test per docs/modules/review.md: a correct answer
  // phrased differently from the expected one must not be marked wrong.
  it("paraphrased-correct: a differently-phrased correct answer is still marked correct", async () => {
    const grader = new FixtureAnswerGrader("paraphrased-correct");
    const result = await grader.grade(input);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.correct).toBe(true);
  });

  it("incorrect: marks incorrect, suggests again(1)", async () => {
    const grader = new FixtureAnswerGrader("incorrect");
    const result = await grader.grade(input);
    expect(result).toEqual({ ok: true, value: { correct: false, feedback: expect.any(String) as string, suggestedRating: 1 } });
  });

  it("partial: correct but suggests hard(2), not good(3)", async () => {
    const grader = new FixtureAnswerGrader("partial");
    const result = await grader.grade(input);
    expect(result).toEqual({ ok: true, value: { correct: true, feedback: expect.any(String) as string, suggestedRating: 2 } });
  });

  it("model-error: surfaces as an error result", async () => {
    const grader = new FixtureAnswerGrader("model-error");
    const result = await grader.grade(input);
    expect(result.ok).toBe(false);
  });
});
