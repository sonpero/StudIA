// Regression for the 43-page A2A course that produced zero notions: its
// extraction went to the splitter as 9 heading-delimited chunks, the first
// one 45 767 characters long, and the model's output was truncated. No LLM
// here — this runs the real extraction and the real chunker the split job
// uses, and asserts every chunk is a size the splitter's maxTokens covers.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import { OfficeParserExtractor } from "../../ingestion/index.js";
import { chunkBySize, DEFAULT_CHUNKING } from "../domain/chunk-by-size.js";

const a2aPdf = readFileSync(fileURLToPath(new URL("../../../../../tests/fixtures/ingestion/a2a-course.pdf", import.meta.url)));

describe("A2A course (43-page PDF): extraction then chunking", () => {
  let markdown = "";
  let chunks: string[] = [];

  beforeAll(async () => {
    const result = await new OfficeParserExtractor().extract({ bytes: a2aPdf, sourceType: "pdf" });
    if (!result.ok) throw new Error(`extraction failed: ${result.error.message}`);
    markdown = result.value.markdown;
    chunks = chunkBySize(markdown);
  });

  it("splits into a handful of chunks, none above the hard max", () => {
    expect(chunks.length).toBeGreaterThanOrEqual(5);
    expect(chunks.length).toBeLessThanOrEqual(12);
    expect(Math.max(...chunks.map((c) => c.length))).toBeLessThanOrEqual(DEFAULT_CHUNKING.maxChars);
  });

  it("loses nothing: the chunks rejoin into the extraction", () => {
    expect(chunks.join("\n\n")).toBe(markdown.trim());
  });

  it("carries no pagination, running header or punctuation-only line into any chunk", () => {
    const lines = chunks.flatMap((c) => c.split("\n")).map((l) => l.replace(/^#+\s+/, "").trim());

    expect(lines.filter((l) => /^Page \d+ of 43$/.test(l))).toEqual([]);
    expect(lines.filter((l) => l === "Cours complet : le protocole Agent2Agent (A2A)")).toEqual([]);
    expect(lines.filter((l) => l !== "" && /^[\p{P}\s]+$/u.test(l) && !/[{}[\]]/.test(l))).toEqual([]);
  });
});
