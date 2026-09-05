const DEFAULT_MAX_LENGTH = 60;
const BLANK_FALLBACK = "Question sans texte";

// A conversation's title (docs/modules/tutor.md): the student's own first
// question, never a model-generated summary, and never the creation date --
// two conversations started the same day would otherwise be indistinguishable.
export function truncateTitle(question: string, maxLength: number = DEFAULT_MAX_LENGTH): string {
  const trimmed = question.trim();
  if (trimmed === "") return BLANK_FALLBACK;
  if (trimmed.length <= maxLength) return trimmed;

  const cut = trimmed.slice(0, maxLength);
  const lastSpace = cut.lastIndexOf(" ");
  const boundary = lastSpace > 0 ? cut.slice(0, lastSpace) : cut;
  return `${boundary}…`;
}
