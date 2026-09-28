const MIN_TITLE_LENGTH = 3;
const MAX_TITLE_LENGTH = 80;

// Under 3 characters a title names nothing. The only length rule a generated
// title is still rejected for: over 80 is tolerated then repaired by
// fitTitle (docs/modules/content.md), since the model cannot be held to it.
export function isTitleTooShort(title: string): boolean {
  return title.trim().length < MIN_TITLE_LENGTH;
}

// title: 3 to 80 chars, a noun phrase, not a question (docs/modules/content.md).
// Length is the only part of that rule code can check; "noun phrase, not a
// question" is a prompt/eval concern, not a domain invariant. Still enforced
// in full on a manual edit (updateNotion).
export function isValidTitle(title: string): boolean {
  return !isTitleTooShort(title) && title.trim().length <= MAX_TITLE_LENGTH;
}
