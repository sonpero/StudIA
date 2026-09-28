// The splitter asks the model for 3 to 80 characters (claude-notion-splitter.ts),
// but that is only an instruction: the model overshoots now and then, and a
// title over 80 used to fail the whole document after every chunk had been
// paid for, then re-split it up to three times (A2A in production, 2026-09-27:
// an 82-character title). A small overshoot is kept as is and only a title
// past the tolerance is shortened, deterministically and without another
// model call. 100, not more: at 375px the Notions card wraps a 100-character
// title on seven lines against six at 80 (measured 2026-09-28).
export const TITLE_LENGTH_TOLERANCE = 100;
const MIN_TITLE_LENGTH = 3;

// Words a cut title must not end on, French and English: a title ending on
// one reads as cut mid-phrase. Compared lowercased, as whole words only.
const LINKING_WORDS = new Set([
  "à", "au", "aux", "avec", "car", "ce", "ces", "cette", "chez", "dans", "de", "des", "donc", "dont", "du",
  "en", "entre", "et", "la", "le", "les", "leur", "leurs", "mais", "ni", "ou", "où", "par", "pour", "que",
  "qui", "sa", "sans", "ses", "son", "sous", "sur", "un", "une", "vers", "vs",
  "a", "an", "and", "as", "at", "by", "for", "from", "in", "into", "of", "on", "or", "the", "to", "with",
]);

// Closing brackets and quotes are a legitimate end ("(RFC 8693)"), so they
// are not stripped; an opening one left unclosed by the cut is handled below.
const TRAILING_PUNCTUATION = /[\s,;:.!?…\-–—/·]+$/u;

const BRACKETS: [open: string, close: string][] = [
  ["(", ")"],
  ["«", "»"],
];

function count(text: string, char: string): number {
  return text.split(char).length - 1;
}

function dropUnclosedBracket(text: string): string {
  for (const [open, close] of BRACKETS) {
    if (count(text, open) > count(text, close)) return text.slice(0, text.lastIndexOf(open));
  }
  return text;
}

function lastWord(text: string): string {
  return text.slice(text.lastIndexOf(" ") + 1);
}

function tidyEnd(text: string): string {
  let current = text;
  for (;;) {
    let next = dropUnclosedBracket(current).replace(TRAILING_PUNCTUATION, "");
    if (LINKING_WORDS.has(lastWord(next).toLowerCase())) next = next.slice(0, next.length - lastWord(next).length);
    if (next === current) return current;
    current = next;
  }
}

export function fitTitle(title: string): string {
  if (title.trim().length <= TITLE_LENGTH_TOLERANCE) return title;

  const trimmed = title.trim();
  // One character past the limit is looked at so that a word ending exactly
  // on the limit, followed by a space, is kept whole.
  const lastSpace = trimmed.slice(0, TITLE_LENGTH_TOLERANCE + 1).lastIndexOf(" ");
  const wordCut = (lastSpace > 0 ? trimmed.slice(0, lastSpace) : trimmed.slice(0, TITLE_LENGTH_TOLERANCE)).trimEnd();

  const tidied = tidyEnd(wordCut);
  // A title made of nothing but linking words and punctuation: keep the
  // plain cut rather than an empty title.
  return tidied.length < MIN_TITLE_LENGTH ? wordCut : tidied;
}
