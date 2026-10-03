import { describe, expect, it } from "vitest";
import { cardBudget } from "../domain/card-budget.js";
import { FixtureKeyNotionCardGenerator } from "./fixture-key-notion-card-generator.js";
import { FixtureKeyNotionExtractor } from "./fixture-key-notion-extractor.js";

const extractionInput = {
  markdown: "Cours.",
  readingNotions: [
    { id: "n1", title: "Un" },
    { id: "n2", title: "Deux" },
    { id: "n3", title: "Trois" },
  ],
  budget: cardBudget(0),
};

const batchInput = (type: "flashcard" | "mcq" | "open") => ({
  type,
  keyNotions: [
    { index: 0, title: "Un", summary: "S", readingNotionIds: ["n1"] },
    { index: 4, title: "Cinq", summary: "S", readingNotionIds: ["n5"] },
  ],
  readingNotions: [],
});

describe("FixtureKeyNotionExtractor", () => {
  it("valid: one key notion per reading notion, first half essential, first and last synthesis, one section", async () => {
    const result = await new FixtureKeyNotionExtractor("valid").extract(extractionInput);
    expect(result.ok && result.value.sections).toEqual(["Cours"]);
    expect(result.ok && result.value.keyNotions.map((k) => [k.title, k.importance, k.isSynthesis, k.readingNotionIds])).toEqual([
      ["Un", "essential", true, ["n1"]],
      ["Deux", "essential", false, ["n2"]],
      ["Trois", "important", true, ["n3"]],
    ]);
  });

  it("degraded, empty, schema-violation and refine-violation", async () => {
    const degraded = await new FixtureKeyNotionExtractor("degraded").extract(extractionInput);
    expect(degraded.ok && degraded.value.keyNotions).toHaveLength(1);
    expect(await new FixtureKeyNotionExtractor("empty").extract(extractionInput)).toEqual({ ok: true, value: { sections: [], keyNotions: [] } });
    expect((await new FixtureKeyNotionExtractor("schema-violation").extract(extractionInput)).ok).toBe(false);
    expect((await new FixtureKeyNotionExtractor("refine-violation").extract(extractionInput)).ok).toBe(false);
  });
});

describe("FixtureKeyNotionCardGenerator", () => {
  it("valid: one card of the batch's type per key notion, numbered by its position plus one", async () => {
    const flashcards = await new FixtureKeyNotionCardGenerator("valid").generate(batchInput("flashcard"));
    expect(flashcards.ok && flashcards.value.map((c) => [c.keyNotionIndex, c.question])).toEqual([
      [0, "Question 1 ?"],
      [4, "Question 5 ?"],
    ]);
    const mcq = await new FixtureKeyNotionCardGenerator("valid").generate(batchInput("mcq"));
    expect(mcq.ok && mcq.value[0]).toEqual({
      keyNotionIndex: 0,
      type: "mcq",
      question: "QCM 1 ?",
      answer: "Bonne réponse 1",
      options: ["Bonne réponse 1", "Distracteur A1", "Distracteur B1", "Distracteur C1"],
    });
  });

  it("degraded, empty, schema-violation and refine-violation", async () => {
    const degraded = await new FixtureKeyNotionCardGenerator("degraded").generate(batchInput("open"));
    expect(degraded.ok && degraded.value).toHaveLength(1);
    expect(await new FixtureKeyNotionCardGenerator("empty").generate(batchInput("open"))).toEqual({ ok: true, value: [] });
    expect((await new FixtureKeyNotionCardGenerator("schema-violation").generate(batchInput("open"))).ok).toBe(false);
    expect((await new FixtureKeyNotionCardGenerator("refine-violation").generate(batchInput("open"))).ok).toBe(false);
  });
});
