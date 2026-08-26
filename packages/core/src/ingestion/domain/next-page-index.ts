// Contiguous, gapless ordering (docs/modules/ingestion.md): pages are never
// individually removed (only a whole document is deleted), so the existing
// indices are always exactly [0..n-1] and the next one is simply the count.
export function nextPageIndex(existing: number[]): number {
  return existing.length;
}
