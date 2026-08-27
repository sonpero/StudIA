import { describe, expect, it } from "vitest";
import { FixtureCardGenerator } from "./fixture-card-generator.js";

const notion = { title: "Photosynthèse", body: "Corps.", difficulty: "medium" as const };

describe("FixtureCardGenerator", () => {
  it("valid: returns cards matching the schema", async () => {
    const generator = new FixtureCardGenerator("valid");
    const result = await generator.generate({ notion, types: ["flashcard"] });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.length).toBeGreaterThanOrEqual(1);
      expect(result.value.every((c) => c.type === "flashcard" && c.question && c.answer && c.options === null)).toBe(true);
    }
  });

  it("degraded: a single card is a success, not an error", async () => {
    const generator = new FixtureCardGenerator("degraded");
    const result = await generator.generate({ notion, types: ["flashcard"] });
    expect(result).toEqual({ ok: true, value: expect.arrayContaining([expect.anything()]) as unknown });
    if (result.ok) expect(result.value).toHaveLength(1);
  });

  it("empty: an empty array does not crash", async () => {
    const generator = new FixtureCardGenerator("empty");
    const result = await generator.generate({ notion, types: ["flashcard"] });
    expect(result).toEqual({ ok: true, value: [] });
  });

  it("schema-violation: surfaces as an error result", async () => {
    const generator = new FixtureCardGenerator("schema-violation");
    const result = await generator.generate({ notion, types: ["flashcard"] });
    expect(result.ok).toBe(false);
  });

  it("refine-violation: surfaces as an error result", async () => {
    const generator = new FixtureCardGenerator("refine-violation");
    const result = await generator.generate({ notion, types: ["flashcard"] });
    expect(result.ok).toBe(false);
  });
});
