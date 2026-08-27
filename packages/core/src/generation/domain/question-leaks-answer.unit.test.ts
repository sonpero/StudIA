import { describe, expect, it } from "vitest";
import { questionLeaksAnswer } from "./question-leaks-answer.js";

describe("questionLeaksAnswer", () => {
  it("is false when the answer does not appear in the question", () => {
    expect(questionLeaksAnswer("Quel processus transforme la lumière en énergie ?", "photosynthèse")).toBe(false);
  });

  it("is true when the answer appears verbatim in the question", () => {
    expect(questionLeaksAnswer("Que produit la photosynthèse ?", "photosynthèse")).toBe(true);
  });

  it("is true regardless of case", () => {
    expect(questionLeaksAnswer("Que produit la PHOTOSYNTHÈSE ?", "photosynthèse")).toBe(true);
  });
});
