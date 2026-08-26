// docs/UI.md: "Each course gets a colour, assigned automatically at
// creation from this rotating palette". Never --primary or --accent,
// deliberately: a course must never look like the active nav state or the
// primary call to action.
export const SUBJECT_COLOUR_PALETTE = ["#F87171", "#F5B940", "#12B5A5", "#38BDF8", "#8B5CF6", "#EC4899"] as const;

export function nextSubjectColour(existingDocumentCount: number): string {
  // Safe: the modulo always lands within the fixed, non-empty palette.
  return SUBJECT_COLOUR_PALETTE[existingDocumentCount % SUBJECT_COLOUR_PALETTE.length]!;
}
