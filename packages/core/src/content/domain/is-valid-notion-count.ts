export const MIN_NOTIONS = 5;
const BASE_MAX_NOTIONS = 60;
// One notion per 500 characters of extracted Markdown is the finest
// granularity still accepted. Below that, a "notion" is a sentence, not an
// idea that can be learned and reviewed on its own. The fixed cap of 60
// implicitly assumed a lesson of at most 30 000 characters (60 × 500, about
// ten dense pages); the 43-page A2A course (~65 000 characters after
// cleaning, 9 chunks) plausibly yields 60 to 110 notions, and was rejected
// outright by the fixed cap. Now: max(60, ceil(length / 500)) → 131 for it.
const CHARS_PER_NOTION_AT_FINEST = 500;

export function maxNotionCount(markdownLength: number): number {
  return Math.max(BASE_MAX_NOTIONS, Math.ceil(markdownLength / CHARS_PER_NOTION_AT_FINEST));
}

// Below 5, splitting probably failed; above the length-proportional cap,
// the granularity is too fine (docs/modules/content.md). `markdownLength`
// defaults to 0, which keeps the original 5-to-60 bounds for a short lesson.
export function isValidNotionCount(count: number, markdownLength = 0): boolean {
  return count >= MIN_NOTIONS && count <= maxNotionCount(markdownLength);
}
