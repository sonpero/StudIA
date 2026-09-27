import { MIN_NOTIONS } from "./is-valid-notion-count.js";

export type NotionCountTarget = { min: number; max: number };

// Left unguided, the model split the A2A course (9 chunks of ~7 300
// characters) into 315 notions, one per ~208 characters: about 35 per chunk,
// sentence-sized, and 2.4x the document's cap (first real run, 2026-09-27,
// docs/reports/long-documents-notions.md). The prompt now names a range
// instead: one notion per 600 to 1 000 characters. The finest end (600)
// stays coarser than the cap's own finest granularity (500 characters per
// notion, is-valid-notion-count.ts), so a model that follows the target is
// never rejected for being too fine-grained.
const CHARS_PER_NOTION_COARSEST = 1_000;
const CHARS_PER_NOTION_FINEST = 600;

// `onlyChunk`: the chunk is the whole document, so it alone must reach the
// document's floor of 5 notions. A chunk among several only contributes to
// that floor.
export function notionCountTarget(chunkLength: number, options: { onlyChunk: boolean }): NotionCountTarget {
  const coarsest = Math.ceil(chunkLength / CHARS_PER_NOTION_COARSEST);
  const min = options.onlyChunk ? Math.max(coarsest, MIN_NOTIONS) : coarsest;
  const max = Math.max(min, Math.ceil(chunkLength / CHARS_PER_NOTION_FINEST));
  return { min, max };
}
