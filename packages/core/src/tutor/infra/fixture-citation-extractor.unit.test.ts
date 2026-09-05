import { describe, expect, it } from "vitest";
import { FixtureCitationExtractor } from "./fixture-citation-extractor.js";

describe("FixtureCitationExtractor", () => {
  it("valid: returns section indexes matching the schema", async () => {
    const extractor = new FixtureCitationExtractor("valid");
    const result = await extractor.extract({ answer: "Réponse.", sections: [] });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.sectionIndexes.length).toBeGreaterThan(0);
      expect(result.value.sectionIndexes.every((i) => Number.isInteger(i))).toBe(true);
    }
  });

  it("degraded: a legitimate but thin result (only one section cited) is a success, not an error", async () => {
    const extractor = new FixtureCitationExtractor("degraded");
    const result = await extractor.extract({ answer: "Réponse.", sections: [] });
    expect(result).toEqual({ ok: true, value: { sectionIndexes: [0] } });
  });

  it("empty: no supporting section is a success, not an error -- the grounded:false case", async () => {
    const extractor = new FixtureCitationExtractor("empty");
    const result = await extractor.extract({ answer: "Réponse.", sections: [] });
    expect(result).toEqual({ ok: true, value: { sectionIndexes: [] } });
  });

  it("schema-violation: surfaces as an error result", async () => {
    const extractor = new FixtureCitationExtractor("schema-violation");
    const result = await extractor.extract({ answer: "Réponse.", sections: [] });
    expect(result.ok).toBe(false);
  });

  it("refine-violation: surfaces as an error result", async () => {
    const extractor = new FixtureCitationExtractor("refine-violation");
    const result = await extractor.extract({ answer: "Réponse.", sections: [] });
    expect(result.ok).toBe(false);
  });
});
