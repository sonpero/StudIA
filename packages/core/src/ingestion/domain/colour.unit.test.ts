import { describe, expect, it } from "vitest";
import { nextSubjectColour, SUBJECT_COLOUR_PALETTE } from "./colour.js";

describe("nextSubjectColour", () => {
  it("assigns the first palette colour to a user's first document", () => {
    expect(nextSubjectColour(0)).toBe(SUBJECT_COLOUR_PALETTE[0]);
  });

  it("rotates through the palette in order", () => {
    SUBJECT_COLOUR_PALETTE.forEach((colour, i) => {
      expect(nextSubjectColour(i)).toBe(colour);
    });
  });

  it("wraps around once the palette is exhausted", () => {
    expect(nextSubjectColour(SUBJECT_COLOUR_PALETTE.length)).toBe(SUBJECT_COLOUR_PALETTE[0]);
  });
});
