import { describe, expect, it } from "vitest";
import { gradeMcq } from "./grade-mcq.js";

describe("gradeMcq", () => {
  it("is correct, suggesting good(3), when the given option exactly matches the expected answer", () => {
    expect(gradeMcq("Oxygène", "Oxygène")).toEqual({ correct: true, suggestedRating: 3 });
  });

  it("tolerates surrounding whitespace and case differences", () => {
    expect(gradeMcq("Oxygène", " oxygène ")).toEqual({ correct: true, suggestedRating: 3 });
  });

  it("is incorrect, suggesting again(1), when the given option does not match", () => {
    expect(gradeMcq("Oxygène", "Azote")).toEqual({ correct: false, suggestedRating: 1 });
  });
});
