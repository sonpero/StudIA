const MAX_HEADING_LENGTH = 80;
const SENTENCE_ENDING = /[.!?:;]$/;

// officeparser returns flat text with no style/heading information at all
// (verified directly against its output — it does not distinguish a
// Heading1 paragraph from body text). This is a best-effort heuristic to
// recover *some* Markdown heading structure from that flat text, since
// `content` (M3) splits notions on headings: a short, punctuation-free line
// immediately followed by a longer one is promoted to a heading. It cannot
// recover heading *depth* (H1 vs H2) — officeparser gives no signal for
// that — so every promoted line becomes `##`.
export function promoteHeadings(rawText: string): string {
  const lines = rawText
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  return lines
    .map((line, i) => {
      const next = lines[i + 1];
      const looksLikeHeading = line.length <= MAX_HEADING_LENGTH && !SENTENCE_ENDING.test(line) && next !== undefined && next.length > line.length;
      return looksLikeHeading ? `## ${line}` : line;
    })
    .join("\n\n");
}
