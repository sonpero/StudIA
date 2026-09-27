import { describe, expect, it } from "vitest";
import { cleanExtractedText } from "./clean-extracted-text.js";

const BODY = "Un paragraphe de contenu réel, assez long pour ressembler à du cours.";

function pages(count: number, perPage: (page: number) => string[]): string {
  return Array.from({ length: count }, (_, i) => perPage(i + 1).join("\n")).join("\n");
}

function lines(text: string): string[] {
  return text.split("\n");
}

describe("cleanExtractedText — pagination", () => {
  it.each([
    "Page 3 of 43",
    "page 3 of 43",
    "Page 3 sur 43",
    "Page 3 de 43",
    "Page 3 / 43",
    "Page 3/43",
    "Page 3",
    "p. 3",
    "3 / 43",
    "3/43",
    "3 of 43",
    "3 sur 43",
    "- 3 -",
    "— 3 —",
    "  Page 3 of 43  ",
  ])("drops the whole-line pagination marker %j", (marker) => {
    expect(lines(cleanExtractedText(`${BODY}\n${marker}\n${BODY}`))).toEqual([BODY, BODY]);
  });

  it.each([
    "Ajoute 1/2 tasse de farine au mélange.",
    "La page 3 of 43 résume le chapitre.",
    "Page 3 of 43 résume le chapitre.",
    "Voir p. 3 pour la définition.",
  ])("keeps a line that only contains a pagination-like fragment: %j", (line) => {
    expect(lines(cleanExtractedText(`${BODY}\n${line}`))).toEqual([BODY, line]);
  });

  it("keeps an N / M line whose N exceeds M: a ratio, not a page number", () => {
    expect(lines(cleanExtractedText(`${BODY}\n5 / 3`))).toEqual([BODY, "5 / 3"]);
  });
});

describe("cleanExtractedText — punctuation-only lines", () => {
  it.each([",", ".", "),", "(", ";", "·", "•", "…", "« »", " , "])("drops the punctuation-only line %j", (line) => {
    expect(lines(cleanExtractedText(`${BODY}\n${line}\n${BODY}`))).toEqual([BODY, BODY]);
  });

  it.each(["}", "]", "});", "],", "{"])("keeps %j: braces and brackets carry code/JSON structure", (line) => {
    expect(lines(cleanExtractedText(`${BODY}\n${line}`))).toEqual([BODY, line]);
  });

  it("keeps a line mixing punctuation and a word", () => {
    expect(lines(cleanExtractedText(`${BODY}\n(octets,`))).toEqual([BODY, "(octets,"]);
  });
});

describe("cleanExtractedText — running headers and footers", () => {
  const HEADER = "Cours complet : le protocole Agent2Agent (A2A)";

  it("drops a multi-word line repeated identically on every page of a paginated document", () => {
    const text = pages(10, (p) => [`${BODY} ${String(p)}`, HEADER, `Page ${String(p)} of 10`]);

    const cleaned = cleanExtractedText(text);

    expect(cleaned).not.toContain(HEADER);
    expect(lines(cleaned)).toHaveLength(10);
  });

  it("drops a line repeated on exactly 40% of the pages (alternating book-style headers)", () => {
    const text = pages(10, (p) => [`${BODY} ${String(p)}`, ...(p <= 4 ? [HEADER] : []), `Page ${String(p)} of 10`]);

    expect(cleanExtractedText(text)).not.toContain(HEADER);
  });

  it("keeps a line repeated on fewer than 40% of the pages", () => {
    const text = pages(10, (p) => [`${BODY} ${String(p)}`, ...(p <= 3 ? [HEADER] : []), `Page ${String(p)} of 10`]);

    expect(lines(cleanExtractedText(text)).filter((l) => l === HEADER)).toHaveLength(3);
  });

  it("never drops a line repeated fewer than 3 times, however few pages there are", () => {
    const text = pages(2, (p) => [`${BODY} ${String(p)}`, HEADER, `Page ${String(p)} of 2`]);

    expect(lines(cleanExtractedText(text)).filter((l) => l === HEADER)).toHaveLength(2);
  });

  it("keeps a single-word line repeated on every page: an identifier from the content, not a header", () => {
    const text = pages(10, (p) => [`${BODY} ${String(p)}`, "taskId", `Page ${String(p)} of 10`]);

    expect(lines(cleanExtractedText(text)).filter((l) => l === "taskId")).toHaveLength(10);
  });

  it("keeps repeated lines when the document has no pagination at all: no page evidence to measure against", () => {
    const text = Array.from({ length: 10 }, (_, i) => `${BODY} ${String(i)}\n${HEADER}`).join("\n");

    expect(lines(cleanExtractedText(text)).filter((l) => l === HEADER)).toHaveLength(10);
  });

  it("uses the declared total (Page N of M) as the page count, even when some markers are missing", () => {
    // 20 declared pages, only 10 markers extracted: threshold is 40% of 20 = 8.
    const text = pages(10, (p) => [`${BODY} ${String(p)}`, ...(p <= 7 ? [HEADER] : []), `Page ${String(p)} of 20`]);

    expect(lines(cleanExtractedText(text)).filter((l) => l === HEADER)).toHaveLength(7);
  });

  it("counts bare 'Page N' markers as pages when no total is declared", () => {
    const text = pages(5, (p) => [`${BODY} ${String(p)}`, HEADER, `Page ${String(p)}`]);

    expect(cleanExtractedText(text)).not.toContain(HEADER);
  });

  it("compares header lines after trimming", () => {
    // 6 of 10 pages once trimmed (≥ 4), but only 3 of each spelling raw (< 4).
    const header = (p: number) => (p % 2 === 0 ? [`  ${HEADER}`] : [HEADER]);
    const text = pages(10, (p) => [`${BODY} ${String(p)}`, ...(p <= 6 ? header(p) : []), `Page ${String(p)} of 10`]);

    expect(cleanExtractedText(text)).not.toContain(HEADER);
  });
});

describe("cleanExtractedText — everything else", () => {
  it("leaves ordinary content, blank lines included, untouched", () => {
    const text = `Titre\n\n${BODY}\n  indented line\n`;

    expect(cleanExtractedText(text)).toBe(text);
  });

  it("returns an empty string for empty input", () => {
    expect(cleanExtractedText("")).toBe("");
  });
});
