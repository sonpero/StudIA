// Removes layout noise that officeparser flattens into the text stream of a
// PDF: pagination markers, running headers/footers, and punctuation-only
// lines (fragments of table cells and inline code spans, e.g. a lone "," on
// 56 lines of the 43-page A2A course). Left in, promoteHeadings turns them
// into hundreds of fake `##` headings and the model is fed noise.
//
// officeparser@4.2.0 flattens every page's text items into one stream before
// joining them (officeParser.js, parsePdf), so page boundaries are NOT
// recoverable. The page count is therefore estimated from the pagination
// markers themselves (see estimatePageCount), and a running header is a line
// repeated on a large share of those pages. Every match is whole-line only,
// so "1/2 tasse" or "voir page 3" inside a sentence is never touched.

const PAGE_WITH_OPTIONAL_TOTAL = /^(?:page|p\.)\s*(\d+)(?:\s*(?:of|sur|de|\/)\s*(\d+))?$/i;
const BARE_N_OF_M = /^(\d+)\s*(?:of|sur|\/)\s*(\d+)$/i;
const DASHED_PAGE_NUMBER = /^[-–—]\s*\d+\s*[-–—]$/;

// Braces and brackets are excluded on purpose: a lone "}" or "]," closes a
// JSON/code structure the model needs to read a code block (PDF code is
// never fenced, so there is no way to tell code apart from prose here).
const PUNCTUATION_ONLY = /^[\p{P}\s]+$/u;
const CODE_BRACKETS = /[{}[\]]/;

// A line on at least 40% of the pages is a running header/footer. Not 50%+:
// book-style layouts alternate two headers (course title on even pages,
// chapter title on odd ones), each on ~50% of the pages, and a title page or
// a table of contents usually skips the header, pushing each below half.
const RUNNING_HEADER_PAGE_SHARE = 0.4;
// However few pages there are, a line seen only twice is not evidence of a
// running header.
const RUNNING_HEADER_MIN_OCCURRENCES = 3;
// A running header is a phrase (a course title, an author, a copyright
// line). A single repeated token is far more likely to be an identifier from
// the content itself (the A2A course repeats `taskId` 17 times in its tables).
const MULTI_WORD = /\S\s+\S/;

type Pagination = { total: number | null };

function parsePagination(line: string): Pagination | null {
  const page = PAGE_WITH_OPTIONAL_TOTAL.exec(line);
  if (page) return { total: page[2] === undefined ? null : Number(page[2]) };

  const bare = BARE_N_OF_M.exec(line);
  if (bare) {
    const n = Number(bare[1]);
    const m = Number(bare[2]);
    // "5 / 3" is a ratio, not page 5 of 3.
    return n <= m ? { total: m } : null;
  }

  return DASHED_PAGE_NUMBER.test(line) ? { total: null } : null;
}

function isPunctuationOnly(line: string): boolean {
  return PUNCTUATION_ONLY.test(line) && !CODE_BRACKETS.test(line);
}

// The declared total ("Page 3 of 43" → 43) wins when present: some markers
// can be missing from the extraction. Otherwise, one marker per page.
function estimatePageCount(markers: Pagination[]): number {
  const declared = Math.max(0, ...markers.map((m) => m.total ?? 0));
  return Math.max(declared, markers.length);
}

export function cleanExtractedText(rawText: string): string {
  const rawLines = rawText.split("\n");
  const trimmed = rawLines.map((line) => line.trim());

  const paginationMarkers: Pagination[] = [];
  const isPagination = trimmed.map((line) => {
    const marker = parsePagination(line);
    if (marker) paginationMarkers.push(marker);
    return marker !== null;
  });

  const pageCount = estimatePageCount(paginationMarkers);
  const occurrences = new Map<string, number>();
  for (const line of trimmed) occurrences.set(line, (occurrences.get(line) ?? 0) + 1);
  const headerThreshold = Math.max(RUNNING_HEADER_MIN_OCCURRENCES, Math.ceil(RUNNING_HEADER_PAGE_SHARE * pageCount));
  const isRunningHeader = (line: string) =>
    pageCount > 0 && MULTI_WORD.test(line) && (occurrences.get(line) ?? 0) >= headerThreshold;

  return rawLines
    .filter((_, i) => {
      const line = trimmed[i] ?? "";
      return !isPagination[i] && !isPunctuationOnly(line) && !isRunningHeader(line);
    })
    .join("\n");
}
