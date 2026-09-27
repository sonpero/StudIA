// Size-targeted chunking for the notion splitter (docs/modules/content.md,
// "Chunking"). Replaces heading-only chunking, which gave a 43-page PDF a
// 45 767-character first chunk because its only `#` lines were comments in
// its code samples: every chunk must fit one model call whose output (the
// notions' self-contained bodies, as JSON) stays under the splitter's
// maxTokens, so size is the constraint and headings only a preference.
//
// Blocks are paragraphs (separated by blank lines) or whole fenced code
// blocks (``` or ~~~), which are never cut, even when larger than maxChars.
// Limitation: PDF extraction never produces fences (officeparser returns
// flat text), so a PDF's code sample is seen as ordinary paragraphs and may
// be cut between two of its lines; only docx/photo/typed Markdown with
// fences is protected.

export type ChunkingOptions = { targetChars: number; maxChars: number };

// 10 000 characters of French course text is ~3 300 tokens of input at a
// conservative 3 characters per token; the hard max of 15 000 (~5 000 tokens)
// is what the splitter's maxTokens is sized against (see
// claude-notion-splitter.ts for the full calculation).
export const DEFAULT_CHUNKING: ChunkingOptions = { targetChars: 10_000, maxChars: 15_000 };

// A heading is worth cutting before once the chunk is 70% full: a section
// boundary is a better cut than an arbitrary paragraph, but not at the cost
// of a flood of small chunks (each one is a model call that must produce
// notions on its own). At 50%, the A2A PDF — whose extraction still carries
// ~300 promoted `##` lines, many of them table cells — went to 12 chunks of
// ~5 000 characters instead of 8 of ~8 000.
const HEADING_CUT_MIN_SHARE = 0.7;
// A last chunk under a quarter of the target is folded into the previous
// one (if the hard max allows): a few trailing paragraphs are not worth a
// model call of their own, and would likely yield one or two notions.
const TINY_LAST_CHUNK_SHARE = 0.25;

const SEPARATOR = "\n\n";
const HEADING = /^#{1,6}\s/;
const FENCE_OPEN = /^ {0,3}(`{3,}|~{3,})/;

type Block = { text: string; isHeading: boolean };

function closesFence(line: string, fence: string): boolean {
  const match = /^ {0,3}(`{3,}|~{3,})\s*$/.exec(line);
  const marker = match?.[1];
  return marker !== undefined && marker[0] === fence[0] && marker.length >= fence.length;
}

function splitIntoBlocks(markdown: string): Block[] {
  const blocks: Block[] = [];
  let paragraph: string[] = [];
  let fence: { marker: string; lines: string[] } | null = null;

  const flushParagraph = () => {
    if (paragraph.length > 0) blocks.push({ text: paragraph.join("\n"), isHeading: HEADING.test(paragraph[0] ?? "") });
    paragraph = [];
  };

  for (const line of markdown.split("\n")) {
    if (fence) {
      fence.lines.push(line);
      if (closesFence(line, fence.marker)) {
        blocks.push({ text: fence.lines.join("\n"), isHeading: false });
        fence = null;
      }
      continue;
    }
    const open = FENCE_OPEN.exec(line)?.[1];
    if (open !== undefined) {
      flushParagraph();
      fence = { marker: open, lines: [line] };
    } else if (line.trim() === "") {
      flushParagraph();
    } else {
      paragraph.push(line);
    }
  }
  flushParagraph();
  // An unclosed fence runs to the end of the document (CommonMark).
  if (fence) blocks.push({ text: fence.lines.join("\n").trimEnd(), isHeading: false });
  return blocks;
}

function sizeOf(blocks: Block[]): number {
  return blocks.reduce((total, block, i) => total + block.text.length + (i > 0 ? SEPARATOR.length : 0), 0);
}

export function chunkBySize(markdown: string, options: ChunkingOptions = DEFAULT_CHUNKING): string[] {
  const chunks: Block[][] = [];
  let current: Block[] = [];

  const cut = () => {
    // A heading belongs with what follows it, never at the end of a chunk.
    const carried: Block[] = [];
    while (current.length > 1 && current[current.length - 1]?.isHeading) {
      const heading = current.pop();
      if (heading) carried.unshift(heading);
    }
    chunks.push(current);
    current = carried;
  };

  for (const block of splitIntoBlocks(markdown)) {
    if (current.length > 0) {
      const size = sizeOf(current);
      const headingCut = block.isHeading && size >= options.targetChars * HEADING_CUT_MIN_SHARE;
      const targetReached = size >= options.targetChars;
      const wouldExceedMax = size + SEPARATOR.length + block.text.length > options.maxChars;
      if (headingCut || targetReached || wouldExceedMax) cut();
    }
    current.push(block);
  }
  if (current.length > 0) chunks.push(current);

  const last = chunks[chunks.length - 1];
  const previous = chunks[chunks.length - 2];
  if (last && previous && sizeOf(last) < options.targetChars * TINY_LAST_CHUNK_SHARE && sizeOf([...previous, ...last]) <= options.maxChars) {
    chunks.splice(chunks.length - 2, 2, [...previous, ...last]);
  }

  return chunks.map((blocks) => blocks.map((b) => b.text).join(SEPARATOR));
}
