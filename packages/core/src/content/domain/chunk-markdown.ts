// A long course exceeds a comfortable context: split on top-level headings
// first, call the splitter per chunk, then renumber positions globally
// (docs/modules/content.md). Chunk boundaries follow the document's own
// structure, which is exactly why `ingestion` preserves headings.
const TOP_LEVEL_HEADING = /^#(?!#)\s.*$/;

export function chunkByTopLevelHeadings(markdown: string): string[] {
  if (markdown.trim() === "") return [];

  const lines = markdown.split("\n");
  const chunks: string[] = [];
  let current: string[] = [];

  for (const line of lines) {
    if (TOP_LEVEL_HEADING.test(line) && current.length > 0) {
      chunks.push(current.join("\n").trim());
      current = [line];
    } else {
      current.push(line);
    }
  }
  if (current.length > 0) chunks.push(current.join("\n").trim());

  return chunks.filter((chunk) => chunk !== "");
}
