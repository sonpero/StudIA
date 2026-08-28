import { describe, expect, it } from "vitest";
import { answerAmongOptions, areOptionsDistinct, optionLengthsArePlausible } from "./mcq-invariants.js";

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
