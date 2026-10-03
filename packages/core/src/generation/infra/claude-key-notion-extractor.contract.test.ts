// Transport level (docs/TESTING.md): MSW intercepts the real HTTP call so
// generateObject runs. Object output: the tool input is the object itself
// (no `elements` wrapper, unlike output: "array").
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createLanguageModel } from "../../shared/index.js";
import { cardBudget } from "../domain/card-budget.js";
import { ClaudeKeyNotionExtractor, KEY_NOTION_EXTRACTOR_MAX_TOKENS } from "./claude-key-notion-extractor.js";

const ANTHROPIC_MESSAGES_URL = "https://api.anthropic.com/v1/messages";

function toolResponse(input: unknown, stopReason = "tool_use") {
  return HttpResponse.json({
    id: "msg_test",
    type: "message",
    role: "assistant",
    model: "claude-sonnet-5",
    content: [{ type: "tool_use", id: "toolu_1", name: "json", input }],
    stop_reason: stopReason,
    usage: { input_tokens: 10, output_tokens: 5 },
  });
}

const input = {
  markdown: "# 1. Introduction\n\nA2A relie des agents.\n\n# 2. Agent Card\n\nUne carte décrit un agent.",
  readingNotions: [
    { id: "uuid-1", title: "Pourquoi A2A" },
    { id: "uuid-2", title: "Rôle de l'Agent Card" },
  ],
  // Minimum lowered to the two key notions of `valid` below, so that a
  // valid answer is not also a below-minimum one (which asks again).
  budget: { ...cardBudget(0), keyNotions: { min: 2, max: 10 } },
};

const keyNotion = (overrides: Record<string, unknown> = {}) => ({
  title: "Rôle d'A2A",
  importance: "essential",
  synthesis: false,
  section: 0,
  summary: "A2A fait coopérer des agents.",
  readingNotions: ["L1"],
  ...overrides,
});

const valid = { sections: ["1. Introduction", "2. Agent Card"], keyNotions: [keyNotion(), keyNotion({ title: "Agent Card", section: 1, readingNotions: ["L2", "L1"] })] };

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function record(responses: unknown[], stopReason?: string) {
  const bodies: string[] = [];
  server.use(
    http.post(ANTHROPIC_MESSAGES_URL, async ({ request }) => {
      bodies.push(await request.clone().text());
      return toolResponse(responses[Math.min(bodies.length - 1, responses.length - 1)], stopReason);
    }),
  );
  return bodies;
}

const extractor = () => new ClaudeKeyNotionExtractor(createLanguageModel({ apiKey: "test-key" }));

describe("ClaudeKeyNotionExtractor (transport level, via MSW)", () => {
  it("valid: one call, references resolved to reading-notion ids, sections kept in order", async () => {
    const bodies = record([valid]);

    const result = await extractor().extract(input);

    expect(bodies).toHaveLength(1);
    expect(result).toEqual({
      ok: true,
      value: {
        sections: ["1. Introduction", "2. Agent Card"],
        keyNotions: [
          { title: "Rôle d'A2A", importance: "essential", isSynthesis: false, sectionIndex: 0, summary: "A2A fait coopérer des agents.", readingNotionIds: ["uuid-1"] },
          { title: "Agent Card", importance: "essential", isSynthesis: false, sectionIndex: 1, summary: "A2A fait coopérer des agents.", readingNotionIds: ["uuid-2", "uuid-1"] },
        ],
      },
    });
  });

  it("sends the whole course, the reading notions as L references, the budget ranges and an explicit max_tokens", async () => {
    const bodies = record([valid]);
    await extractor().extract(input);

    const body = JSON.parse(bodies[0]!) as { max_tokens: number; messages: { content: { text: string }[] }[] };
    const prompt = body.messages[0]!.content.map((c) => c.text).join("");
    expect(body.max_tokens).toBe(KEY_NOTION_EXTRACTOR_MAX_TOKENS);
    expect(prompt).toContain("L1 — Pourquoi A2A");
    expect(prompt).toContain("L2 — Rôle de l'Agent Card");
    expect(prompt).toContain("Une carte décrit un agent.");
    expect(prompt).toContain("entre 2 et 10 notions clés");
    expect(prompt).toContain("entre 2 et 4 sont essentielles");
    expect(prompt).toContain("Entre 1 et 2 sont des notions de synthèse");
  });

  it("asks for the sections first, never fewer key notions than the minimum, and a strict notion of synthesis", async () => {
    const bodies = record([valid]);
    await extractor().extract(input);

    const prompt = (JSON.parse(bodies[0]!) as { messages: { content: { text: string }[] }[] }).messages[0]!.content.map((c) => c.text).join("");
    expect(prompt).toContain("deux champs, tous deux obligatoires : sections, puis keyNotions");
    expect(prompt).toContain("jamais moins de 2");
    expect(prompt).toContain("Une notion de lecture contient souvent plusieurs notions clés");
    expect(prompt).toContain("Un tableau ou une liste à restituer n'est pas une synthèse");
  });

  it("below the budget's minimum, asks once more naming the shortfall, and keeps the fuller answer", async () => {
    const fiveInput = { ...input, budget: { ...input.budget, keyNotions: { min: 3, max: 6 } } };
    const third = keyNotion({ title: "Troisième notion", section: 1, readingNotions: ["L2"] });
    const bodies = record([valid, { ...valid, keyNotions: [...valid.keyNotions, third] }]);

    const result = await extractor().extract(fiveInput);

    expect(bodies).toHaveLength(2);
    expect(bodies[1]).toContain("au moins 3 notions clés");
    expect(result.ok && result.value.keyNotions).toHaveLength(3);
  });

  it("below the minimum twice: keeps the fuller of the two answers instead of failing", async () => {
    const fiveInput = { ...input, budget: { ...input.budget, keyNotions: { min: 4, max: 6 } } };
    const bodies = record([valid, { ...valid, keyNotions: [valid.keyNotions[1]] }]);

    const result = await extractor().extract(fiveInput);

    expect(bodies).toHaveLength(2);
    expect(result.ok && result.value.keyNotions).toHaveLength(2);
  });

  it("caps the count and asks to group when the course already has more reading notions than the minimum", async () => {
    const many = { ...input, readingNotions: Array.from({ length: 12 }, (_, i) => ({ id: `uuid-${String(i)}`, title: `Notion ${String(i)}` })), budget: { ...input.budget, keyNotions: { min: 2, max: 10 } } };
    const bodies = record([valid]);
    await extractor().extract(many);

    const prompt = (JSON.parse(bodies[0]!) as { messages: { content: { text: string }[] }[] }).messages[0]!.content.map((c) => c.text).join("");
    expect(prompt).toContain("jamais plus de 10");
    expect(prompt).toContain("Une notion clé peut regrouper plusieurs notions de lecture");
    expect(prompt).not.toContain("Une notion de lecture contient souvent plusieurs notions clés");
  });

  it("schema-violation: retries exactly once with the error fed back, then succeeds", async () => {
    const bodies = record([{ sections: ["Cours"] }, valid]);
    const result = await extractor().extract(input);

    expect(bodies).toHaveLength(2);
    expect(bodies[1]).toContain("format attendu");
    expect(result.ok).toBe(true);
  });

  it("schema-violation: fails after the single retry is also rejected", async () => {
    const bodies = record([{ sections: ["Cours"] }]);
    const result = await extractor().extract(input);

    expect(bodies).toHaveLength(2);
    expect(result).toMatchObject({ ok: false, error: { kind: "model-error" } });
  });

  it("refine-violation: a section with no key notion is retried once, naming the section", async () => {
    const uncovered = { sections: ["1. Introduction", "2. Agent Card"], keyNotions: [keyNotion()] };
    const bodies = record([uncovered, valid]);
    const result = await extractor().extract(input);

    expect(bodies).toHaveLength(2);
    expect(bodies[1]).toContain("2. Agent Card");
    expect(result.ok).toBe(true);
  });

  it("refine-violation: still uncovered after the retry fails", async () => {
    record([{ sections: ["1. Introduction", "2. Agent Card"], keyNotions: [keyNotion()] }]);
    expect((await extractor().extract(input)).ok).toBe(false);
  });

  it("drops unknown references, and rejects a key notion left with none", async () => {
    const someUnknown = { ...valid, keyNotions: [keyNotion({ readingNotions: ["L1", "L99"] }), keyNotion({ title: "Agent Card", section: 1, readingNotions: ["L2"] })] };
    record([someUnknown]);
    const result = await extractor().extract(input);
    expect(result.ok && result.value.keyNotions[0]?.readingNotionIds).toEqual(["uuid-1"]);

    server.resetHandlers();
    const bodies = record([{ ...valid, keyNotions: [keyNotion({ readingNotions: ["L99"] }), valid.keyNotions[1]] }, valid]);
    expect((await extractor().extract(input)).ok).toBe(true);
    expect(bodies).toHaveLength(2);
    expect(bodies[1]).toContain("Rôle d'A2A");
  });

  it("rejects a section index outside the section list", async () => {
    const bodies = record([{ ...valid, keyNotions: [...valid.keyNotions, keyNotion({ title: "Hors liste", section: 7 })] }, valid]);
    expect((await extractor().extract(input)).ok).toBe(true);
    expect(bodies).toHaveLength(2);
  });

  it("empty: no section and no key notion is a result, not a crash", async () => {
    record([{ sections: [], keyNotions: [] }]);
    expect(await extractor().extract(input)).toEqual({ ok: true, value: { sections: [], keyNotions: [] } });
  });

  it("truncation: an output cut at max_tokens is 'truncated' after exactly one call", async () => {
    const bodies = record([valid], "max_tokens");
    const result = await extractor().extract(input);

    expect(bodies).toHaveLength(1);
    expect(result).toMatchObject({ ok: false, error: { kind: "truncated" } });
  });
});
