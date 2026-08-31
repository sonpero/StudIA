// docs/UI.md: "Each course gets a colour, assigned automatically at
// creation from this rotating palette". Never --primary or --accent,
// deliberately: a course must never look like the active nav state or the
// primary call to action — nor, since docs/UI.md's Colour note, any other
// semantic token (--success, --warning) or a hue close enough to one to
// read as the same colour. Two passes have touched this array since it
// was first written, both for a measured reason:
// - SVT's default moved from #12B5A5 to #12B2B5 when --accent became a
//   deep green: the old value sat 9.7° from candidate accent greens, a
//   real on-screen collision.
// - This pass: recomputing contrast on every value (not trusting the
//   earlier note, which under-counted) found four of six failing 3:1
//   against white, not the three previously written down. All six moved
//   or confirmed to clear both the hue-distance and the contrast floor;
//   Anglais's own value also changed hue, forced by the narrow corridor
//   between subject red and --warning.
// apps/web's own tokens.colour-collision.unit.test.ts keeps a literal
// copy of this array (it cannot import @studia/core) and enforces both
// floors against every semantic token; update both files together.
export const SUBJECT_COLOUR_PALETTE = ["#F75757", "#F36016", "#109DA0", "#0897D6", "#8B5CF6", "#EC4899"] as const;

export function nextSubjectColour(existingDocumentCount: number): string {
  // Safe: the modulo always lands within the fixed, non-empty palette.
  return SUBJECT_COLOUR_PALETTE[existingDocumentCount % SUBJECT_COLOUR_PALETTE.length]!;
}
