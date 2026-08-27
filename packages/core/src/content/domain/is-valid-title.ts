const MIN_TITLE_LENGTH = 3;
const MAX_TITLE_LENGTH = 80;

// title: 3 to 80 chars, a noun phrase, not a question (docs/modules/content.md).
// Length is the only part of that rule code can check; "noun phrase, not a
// question" is a prompt/eval concern, not a domain invariant.
export function isValidTitle(title: string): boolean {
  const trimmed = title.trim();
  return trimmed.length >= MIN_TITLE_LENGTH && trimmed.length <= MAX_TITLE_LENGTH;
}
