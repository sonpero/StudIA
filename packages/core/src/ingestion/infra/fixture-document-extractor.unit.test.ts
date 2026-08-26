import { describe, expect, it } from "vitest";
import { FixtureDocumentExtractor } from "./fixture-document-extractor.js";

const input = { bytes: Buffer.from("x"), sourceType: "photo" as const };

describe("FixtureDocumentExtractor", () => {
  it("valid: returns Markdown with headings, legible", async () => {
    const extractor = new FixtureDocumentExtractor("valid");
    const result = await extractor.extract(input);
    expect(result).toEqual({ ok: true, value: { markdown: expect.stringContaining("#") as string, legible: true } });
  });

  it("degraded: a legitimate but poor result (illegible) is a result, not an error", async () => {
    const extractor = new FixtureDocumentExtractor("degraded");
    const result = await extractor.extract(input);
    expect(result.ok).toBe(true);
    expect(result.ok && result.value.legible).toBe(false);
    expect(result.ok && result.value.reason).toBeTruthy();
  });

  it("empty: an empty extraction does not crash and is still a successful result", async () => {
    const extractor = new FixtureDocumentExtractor("empty");
    const result = await extractor.extract(input);
    expect(result).toEqual({ ok: true, value: { markdown: "", legible: true } });
  });

  it("schema-violation: surfaces as a model-error after the (simulated) retry is exhausted", async () => {
    const extractor = new FixtureDocumentExtractor("schema-violation");
    const result = await extractor.extract(input);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.kind).toBe("model-error");
  });

  it("refine-violation: surfaces as a model-error (a domain invariant rejected the output)", async () => {
    const extractor = new FixtureDocumentExtractor("refine-violation");
    const result = await extractor.extract(input);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.kind).toBe("model-error");
  });

  it("supports every source type (used interchangeably with either real adapter in tests)", () => {
    const extractor = new FixtureDocumentExtractor("valid");
    expect(extractor.supports("photo")).toBe(true);
    expect(extractor.supports("pdf")).toBe(true);
  });
});
