import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { OfficeParserExtractor } from "./office-parser-extractor.js";

const sampleDocx = readFileSync(fileURLToPath(new URL("../../../../../tests/fixtures/ingestion/sample.docx", import.meta.url)));

describe("OfficeParserExtractor", () => {
  it("supports pdf, docx and pptx, not photo", () => {
    const extractor = new OfficeParserExtractor();
    expect(extractor.supports("pdf")).toBe(true);
    expect(extractor.supports("docx")).toBe(true);
    expect(extractor.supports("pptx")).toBe(true);
    expect(extractor.supports("photo")).toBe(false);
  });

  it("extracts a docx fixture with headings preserved as Markdown, legible", async () => {
    const extractor = new OfficeParserExtractor();

    const result = await extractor.extract({ bytes: sampleDocx, sourceType: "docx" });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.legible).toBe(true);
    expect(result.value.markdown).toContain("## La photosynthese");
    expect(result.value.markdown).toContain("## Les etapes");
  });

  it("returns a corrupted-file error for bytes that are not a real office document", async () => {
    const extractor = new OfficeParserExtractor();

    const result = await extractor.extract({ bytes: Buffer.from("not a real docx"), sourceType: "docx" });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe("corrupted-file");
  });
});
