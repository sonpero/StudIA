// Regression for a real 43-page course (dense tables, unfenced code blocks,
// a running header on every page and a "Page N of 43" footer) that produced
// zero notions: officeparser flattens every page into one text stream, and
// the layout noise it carries became hundreds of fake `##` headings.
// tests/fixtures/ingestion/a2a-course.pdf is that course, unmodified.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import { OfficeParserExtractor } from "./office-parser-extractor.js";

const a2aPdf = readFileSync(fileURLToPath(new URL("../../../../../tests/fixtures/ingestion/a2a-course.pdf", import.meta.url)));
const RUNNING_HEADER = "Cours complet : le protocole Agent2Agent (A2A)";

describe("OfficeParserExtractor on a long, dense PDF (A2A course, 43 pages)", () => {
  let paragraphs: string[] = [];

  beforeAll(async () => {
    const result = await new OfficeParserExtractor().extract({ bytes: a2aPdf, sourceType: "pdf" });
    if (!result.ok) throw new Error(`extraction failed: ${result.error.message}`);
    paragraphs = result.value.markdown.split("\n\n").map((p) => p.replace(/^#+\s+/, ""));
  });

  it("keeps the course content", () => {
    expect(paragraphs.join("\n").length).toBeGreaterThan(50_000);
    expect(paragraphs).toContain("Le problème résolu");
  });

  it("drops every 'Page N of 43' footer", () => {
    expect(paragraphs.filter((p) => /^Page \d+ of 43$/.test(p))).toEqual([]);
  });

  it("drops the running header repeated on every page", () => {
    expect(paragraphs.filter((p) => p === RUNNING_HEADER)).toEqual([]);
  });

  it("drops punctuation-only lines (table-cell and inline-code fragments)", () => {
    expect(paragraphs.filter((p) => /^[\p{P}\s]+$/u.test(p) && !/[{}[\]]/.test(p))).toEqual([]);
  });
});
