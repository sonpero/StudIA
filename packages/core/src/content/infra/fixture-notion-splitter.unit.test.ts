import { describe, expect, it } from "vitest";
import { FixtureNotionSplitter } from "./fixture-notion-splitter.js";

describe("FixtureNotionSplitter", () => {
  it("valid: returns notions matching the schema", async () => {
    const splitter = new FixtureNotionSplitter("valid");
    const result = await splitter.split({ markdown: "# Cours" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.length).toBeGreaterThanOrEqual(5);
      expect(result.value.every((n) => n.title && n.body && n.difficulty)).toBe(true);
    }
  });

  it("degraded: a legitimate but poor result (too few notions) is a success, not an error", async () => {
    const splitter = new FixtureNotionSplitter("degraded");
    const result = await splitter.split({ markdown: "# Cours court" });
    expect(result).toEqual({ ok: true, value: expect.arrayContaining([expect.anything()]) as unknown });
    if (result.ok) expect(result.value.length).toBeLessThan(5);
  });

  it("empty: an empty array does not crash", async () => {
    const splitter = new FixtureNotionSplitter("empty");
    const result = await splitter.split({ markdown: "" });
    expect(result).toEqual({ ok: true, value: [] });
  });

  it("schema-violation: surfaces as an error result", async () => {
    const splitter = new FixtureNotionSplitter("schema-violation");
    const result = await splitter.split({ markdown: "# Cours" });
    expect(result.ok).toBe(false);
  });

  it("refine-violation: surfaces as an error result", async () => {
    const splitter = new FixtureNotionSplitter("refine-violation");
    const result = await splitter.split({ markdown: "# Cours" });
    expect(result.ok).toBe(false);
  });

  it("valid: never returns a title listed in avoidTitles, case-insensitively, so every chunk of a course gets distinct titles", async () => {
    const splitter = new FixtureNotionSplitter("valid");
    const first = await splitter.split({ markdown: "# Partie 1" });
    if (!first.ok) throw new Error("expected ok");
    const avoidTitles = first.value.map((n) => n.title.toUpperCase());

    const second = await splitter.split({ markdown: "# Partie 2", avoidTitles });

    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.value).toHaveLength(5);
    const avoided = new Set(avoidTitles.map((t) => t.toLowerCase()));
    expect(second.value.filter((n) => avoided.has(n.title.toLowerCase()))).toEqual([]);
  });
});

