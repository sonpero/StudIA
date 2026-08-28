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

  it("valid: mcq cards satisfy the domain invariants (4 options, answer among them, distinct)", async () => {
    const generator = new FixtureCardGenerator("valid");
    const result = await generator.generate({ notion, types: ["mcq"] });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.length).toBeGreaterThanOrEqual(1);
    for (const card of result.value) {
      expect(card.type).toBe("mcq");
      expect(card.options).toHaveLength(4);
      expect(card.options).toContain(card.answer);
      expect(new Set(card.options?.map((o) => o.trim().toLowerCase())).size).toBe(4);
    }
  });

  it("valid: open cards have no options", async () => {
    const generator = new FixtureCardGenerator("valid");
    const result = await generator.generate({ notion, types: ["open"] });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.length).toBeGreaterThanOrEqual(1);
    expect(result.value.every((c) => c.type === "open" && c.options === null && c.question && c.answer)).toBe(true);
  });

  it("valid: generates cards for every requested type in one call", async () => {
    const generator = new FixtureCardGenerator("valid");
    const result = await generator.generate({ notion, types: ["flashcard", "mcq", "open"] });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const types = new Set(result.value.map((c) => c.type));
    expect(types).toEqual(new Set(["flashcard", "mcq", "open"]));
  });
});
