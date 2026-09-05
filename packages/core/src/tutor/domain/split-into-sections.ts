// Citation anchors, not chunks for a retrieval index (docs/modules/tutor.md:
// there is no retrieval index in this module). Split on markdown paragraph
// boundaries, then fold any fragment shorter than `minSize` into its
// neighbour so a bare heading line is never promoted to a section of its
// own -- it reads as "## Définition" glued to the paragraph under it, not as
// an isolated, uncitable line.

const PARAGRAPH_BOUNDARY = /\n\s*\n/;
const DEFAULT_MIN_SIZE = 80;

export function splitIntoParagraphs(markdown: string): string[] {
  if (markdown.trim() === "") return [];
  return markdown
    .split(PARAGRAPH_BOUNDARY)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph !== "");
}

export function splitIntoSections(markdown: string, minSize: number = DEFAULT_MIN_SIZE): string[] {
  const sections: string[] = [];
  let pending: string | null = null;

  for (const paragraph of splitIntoParagraphs(markdown)) {
    const candidate: string = pending === null ? paragraph : `${pending}\n\n${paragraph}`;
    pending = null;

    if (candidate.length < minSize) {
      pending = candidate;
      continue;
    }

    sections.push(candidate);
  }

  if (pending !== null) {
    const last = sections.at(-1);
    if (last === undefined) {
      sections.push(pending);
    } else {
      sections[sections.length - 1] = `${last}\n\n${pending}`;
    }
  }

  return sections;
}
