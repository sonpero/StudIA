import { describe, expect, it } from "vitest";
import { answerAmongOptions, areOptionsDistinct, optionLengthsArePlausible, optionsArePositionIndependent, shuffleOptions } from "./mcq-invariants.js";

describe("answerAmongOptions", () => {
  it("accepts an answer that matches an option exactly", () => {
    expect(answerAmongOptions("Paris", ["Paris", "Lyon", "Marseille", "Nice"])).toBe(true);
  });

  it("accepts a match that only differs by surrounding whitespace or case", () => {
    expect(answerAmongOptions("paris ", ["Paris", "Lyon", "Marseille", "Nice"])).toBe(true);
  });

  it("rejects an answer absent from the options", () => {
    expect(answerAmongOptions("Toulouse", ["Paris", "Lyon", "Marseille", "Nice"])).toBe(false);
  });
});

describe("areOptionsDistinct", () => {
  it("accepts four distinct options", () => {
    expect(areOptionsDistinct(["Paris", "Lyon", "Marseille", "Nice"])).toBe(true);
  });

  it("rejects a duplicate that only differs by case and whitespace", () => {
    expect(areOptionsDistinct(["Paris", "Lyon", " paris", "Nice"])).toBe(false);
  });

  it("rejects an exact duplicate", () => {
    expect(areOptionsDistinct(["Paris", "Paris", "Marseille", "Nice"])).toBe(false);
  });
});

describe("optionLengthsArePlausible", () => {
  it("accepts options of comparable length", () => {
    expect(optionLengthsArePlausible(["Paris", "Lyon", "Nantes", "Rennes"])).toBe(true);
  });

  it("rejects an option shorter than half the median length", () => {
    expect(optionLengthsArePlausible(["Constantinople", "Alexandrie", "Carthage", "X"])).toBe(false);
  });

  it("rejects an option longer than twice the median length", () => {
    expect(optionLengthsArePlausible(["Paris", "Lyon", "Nice", "Une très longue option qui dépasse largement les autres"])).toBe(false);
  });
});

describe("optionsArePositionIndependent", () => {
  it("accepts four self-contained options", () => {
    expect(optionsArePositionIndependent(["Agent Card", "Task", "Message", "Artifact"])).toBe(true);
  });

  it.each([
    ["Toutes les réponses ci-dessus"],
    ["Toutes les propositions"],
    ["Aucune des réponses précédentes"],
    ["Aucune de ces propositions"],
    ["A et B"],
    ["Les réponses A et C"],
    ["Les deux premières"],
    ["Réponse B"],
  ])("rejects an option that only makes sense by its position: %s", (option) => {
    expect(optionsArePositionIndependent(["Agent Card", "Task", "Message", option])).toBe(false);
  });
});

describe("shuffleOptions", () => {
  const options = ["Bonne", "Faux 1", "Faux 2", "Faux 3"];

  it("returns the same four options, in the same order for the same seed", () => {
    const shuffled = shuffleOptions(options, "question-1");
    expect([...shuffled].sort()).toEqual([...options].sort());
    expect(shuffleOptions(options, "question-1")).toEqual(shuffled);
  });

  it("does not leave the correct answer at a fixed position across questions", () => {
    const positions = new Set(Array.from({ length: 40 }, (_, i) => shuffleOptions(options, `question-${String(i)}`).indexOf("Bonne")));
    expect(positions).toEqual(new Set([0, 1, 2, 3]));
  });
});
