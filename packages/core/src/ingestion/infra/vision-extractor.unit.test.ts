import { describe, expect, it } from "vitest";
import { createLanguageModel } from "../../shared/index.js";
import { VisionExtractor } from "./vision-extractor.js";

describe("VisionExtractor", () => {
  it("supports only photo", () => {
    const extractor = new VisionExtractor(createLanguageModel({ apiKey: "test-key" }));
    expect(extractor.supports("photo")).toBe(true);
    expect(extractor.supports("pdf")).toBe(false);
    expect(extractor.supports("docx")).toBe(false);
    expect(extractor.supports("pptx")).toBe(false);
  });
});
