import { describe, expect, it } from "vitest";
import { truncateTitle } from "./truncate-title.js";

describe("truncateTitle", () => {
  it("returns a short question verbatim, no ellipsis", () => {
    expect(truncateTitle("C'est quoi la photosynthèse ?")).toBe("C'est quoi la photosynthèse ?");
  });

  it("returns a question that exactly fits maxLength verbatim", () => {
    const question = "a".repeat(60);
    expect(truncateTitle(question, 60)).toBe(question);
  });

  it("cuts a long question at the limit and appends an ellipsis", () => {
    const question = "Peux-tu m'expliquer en détail la différence entre la phase claire et la phase sombre de la photosynthèse ?";
    const result = truncateTitle(question, 60);
    expect(result.length).toBeLessThanOrEqual(61); // 60 + the ellipsis character
    expect(result.endsWith("…")).toBe(true);
  });

  it("never cuts mid-word: the truncated text is a prefix of the original up to a space", () => {
    const question = "Peux-tu m'expliquer en détail la différence entre la phase claire et la phase sombre de la photosynthèse ?";
    const result = truncateTitle(question, 60);
    const withoutEllipsis = result.slice(0, -1);
    expect(question.startsWith(withoutEllipsis)).toBe(true);
    expect(question[withoutEllipsis.length]).toBe(" ");
  });

  it("falls back to a fixed placeholder for a blank question", () => {
    expect(truncateTitle("")).toBe("Question sans texte");
    expect(truncateTitle("   \n  ")).toBe("Question sans texte");
  });

  it("trims surrounding whitespace before deciding", () => {
    expect(truncateTitle("  Salut  ")).toBe("Salut");
  });
});
