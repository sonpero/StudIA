// Transport-level (docs/TESTING.md): MSW intercepts the real HTTP call so
// generateObject itself runs, same pattern as claude-notion-splitter.contract.test.ts
// and claude-answer-grader.contract.test.ts.
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createLanguageModel } from "../../shared/index.js";
import type { Section } from "../domain/types.js";
import { ClaudeCitationExtractor } from "./claude-citation-extractor.js";

const ANTHROPIC_MESSAGES_URL = "https://api.anthropic.com/v1/messages";

const SECTIONS: Section[] = [
  { index: 0, text: "La photosynthèse convertit la lumière en énergie chimique." },
  { index: 1, text: "Elle se déroule dans les chloroplastes des cellules végétales." },
];

function anthropicToolUseResponse(toolInput: unknown) {
  return HttpResponse.json({
    id: "msg_test",
    type: "message",
    role: "assistant",
    model: "claude-sonnet-4-5",
    content: [{ type: "tool_use", id: "toolu_1", name: "json", input: toolInput }],
    stop_reason: "tool_use",
    usage: { input_tokens: 10, output_tokens: 5 },
  });
}

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe("ClaudeCitationExtractor (transport level, via MSW)", () => {
  it("valid: a schema-conforming tool call on the first attempt does not retry", async () => {
    let callCount = 0;
    server.use(
      http.post(ANTHROPIC_MESSAGES_URL, () => {
        callCount += 1;
        return anthropicToolUseResponse({ sectionIndexes: [0, 1] });
      }),
    );

    const extractor = new ClaudeCitationExtractor(createLanguageModel({ apiKey: "test-key" }));
    const result = await extractor.extract({ answer: "La photosynthèse a lieu dans les chloroplastes.", sections: SECTIONS });

    expect(callCount).toBe(1);
    expect(result).toEqual({ ok: true, value: { sectionIndexes: [0, 1] } });
  });

  it("empty: no supporting section is a success, not an error", async () => {
    server.use(http.post(ANTHROPIC_MESSAGES_URL, () => anthropicToolUseResponse({ sectionIndexes: [] })));

    const extractor = new ClaudeCitationExtractor(createLanguageModel({ apiKey: "test-key" }));
    const result = await extractor.extract({ answer: "Ce cours n'aborde pas ce sujet.", sections: SECTIONS });

    expect(result).toEqual({ ok: true, value: { sectionIndexes: [] } });
  });

  it("schema-violation: an out-of-range index retries once with the error fed back, then succeeds on the corrected response", async () => {
    let callCount = 0;
    const requestBodies: string[] = [];
    server.use(
      http.post(ANTHROPIC_MESSAGES_URL, async ({ request }) => {
        callCount += 1;
        requestBodies.push(await request.clone().text());
        if (callCount === 1) return anthropicToolUseResponse({ sectionIndexes: [5] });
        return anthropicToolUseResponse({ sectionIndexes: [0] });
      }),
    );

    const extractor = new ClaudeCitationExtractor(createLanguageModel({ apiKey: "test-key" }));
    const result = await extractor.extract({ answer: "Réponse.", sections: SECTIONS });

    expect(callCount).toBe(2);
    expect(requestBodies[1]).toContain("format attendu");
    expect(result).toEqual({ ok: true, value: { sectionIndexes: [0] } });
  });

  it("schema-violation: fails after the single retry is also out of range", async () => {
    let callCount = 0;
    server.use(
      http.post(ANTHROPIC_MESSAGES_URL, () => {
        callCount += 1;
        return anthropicToolUseResponse({ sectionIndexes: [99] });
      }),
    );

    const extractor = new ClaudeCitationExtractor(createLanguageModel({ apiKey: "test-key" }));
    const result = await extractor.extract({ answer: "Réponse.", sections: SECTIONS });

    expect(callCount).toBe(2);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("invalid-output");
  });

  it("refine-violation: duplicate section indexes retries once, then fails if still duplicated", async () => {
    let callCount = 0;
    const requestBodies: string[] = [];
    server.use(
      http.post(ANTHROPIC_MESSAGES_URL, async ({ request }) => {
        callCount += 1;
        requestBodies.push(await request.clone().text());
        return anthropicToolUseResponse({ sectionIndexes: [0, 0] });
      }),
    );

    const extractor = new ClaudeCitationExtractor(createLanguageModel({ apiKey: "test-key" }));
    const result = await extractor.extract({ answer: "Réponse.", sections: SECTIONS });

    expect(callCount).toBe(2);
    expect(requestBodies[1]).toContain("format attendu");
    expect(result.ok).toBe(false);
  });

  it("degraded: a single cited section out of several is a success, not an error", async () => {
    server.use(http.post(ANTHROPIC_MESSAGES_URL, () => anthropicToolUseResponse({ sectionIndexes: [1] })));

    const extractor = new ClaudeCitationExtractor(createLanguageModel({ apiKey: "test-key" }));
    const result = await extractor.extract({ answer: "Réponse.", sections: SECTIONS });

    expect(result).toEqual({ ok: true, value: { sectionIndexes: [1] } });
  });

  it("a single-section course still bounds the schema correctly (max index 0, not negative)", async () => {
    server.use(http.post(ANTHROPIC_MESSAGES_URL, () => anthropicToolUseResponse({ sectionIndexes: [0] })));

    const extractor = new ClaudeCitationExtractor(createLanguageModel({ apiKey: "test-key" }));
    const result = await extractor.extract({ answer: "Réponse.", sections: [SECTIONS[0]!] });

    expect(result).toEqual({ ok: true, value: { sectionIndexes: [0] } });
  });
});
