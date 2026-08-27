const MIN_NOTIONS = 5;
const MAX_NOTIONS = 60;

// 5 to 60 notions per document. Below 5, splitting probably failed; above
// 60, the granularity is too fine (docs/modules/content.md). The bounds are
// explicitly flagged there as a guess to revisit against the M3 eval set.
export function isValidNotionCount(count: number): boolean {
  return count >= MIN_NOTIONS && count <= MAX_NOTIONS;
}
