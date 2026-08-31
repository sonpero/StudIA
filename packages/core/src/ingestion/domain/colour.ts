// docs/UI.md: "Each course gets a colour, assigned automatically at
// creation from this rotating palette". Never --primary or --accent,
// deliberately: a course must never look like the active nav state or the
// primary call to action. The 3rd value (SVT's default) was moved from
// #12B5A5 to #12B2B5 when --accent became a deep green (docs/UI.md's
// Colour note): the old value sat 3.9°(!)-9.7° from candidate accent
// greens, a real on-screen collision — apps/web's own
// tokens.accent-collision.unit.test.ts keeps a literal copy of this array
// (it cannot import @studia/core) and enforces 15° of hue clearance from
// whatever --accent is; update both together.
export const SUBJECT_COLOUR_PALETTE = ["#F87171", "#F5B940", "#12B2B5", "#38BDF8", "#8B5CF6", "#EC4899"] as const;

export function nextSubjectColour(existingDocumentCount: number): string {
  // Safe: the modulo always lands within the fixed, non-empty palette.
  return SUBJECT_COLOUR_PALETTE[existingDocumentCount % SUBJECT_COLOUR_PALETTE.length]!;
}
