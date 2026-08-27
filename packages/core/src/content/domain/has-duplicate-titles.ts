// Titles are unique within a document, case-insensitive after trimming
// (docs/modules/content.md).
export function hasDuplicateTitles(titles: string[]): boolean {
  const normalized = titles.map((title) => title.trim().toLowerCase());
  return new Set(normalized).size !== normalized.length;
}
