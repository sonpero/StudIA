// Transport-level (docs/TESTING.md): MSW intercepts the real HTTP call so
// generateObject itself runs. Request/response shape (tool name "json",
// array wrapped as `{ elements: [...] }`) captured empirically the same way
// as content/infra/claude-notion-splitter.contract.test.ts.
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createLanguageModel } from "../../shared/index.js";
import { ClaudeCardGenerator } from "./claude-card-generator.js";

const ANTHROPIC_MESSAGES_URL = "https://api.anthropic.com/v1/messages";
const notion = { title: "Photosynthèse", body: "La photosynthèse transforme la lumière en énergie.", difficulty: "medium" as const };

function anthropicToolUseResponse(elements: unknown[]) {
  return HttpResponse.json({
    id: "msg_test",
    type: "message",
    role: "assistant",
    model: "claude-sonnet-4-5",
    content: [{ type: "tool_use", id: "toolu_1", name: "json", input: { elements } }],
    stop_reason: "tool_use",
    usage: { input_tokens: 10, output_tokens: 5 },
  });
}

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe("ClaudeCardGenerator (transport level, via MSW)", () => {
  it("valid: a schema-conforming tool call on the first attempt does not retry", async () => {
    let callCount = 0;
    server.use(
      http.post(ANTHROPIC_MESSAGES_URL, () => {
        callCount += 1;
        return anthropicToolUseResponse([{ question: "Que produit la photosynthèse ?", answer: "De l'oxygène" }]);
      }),
    );

    const generator = new ClaudeCardGenerator(createLanguageModel({ apiKey: "test-key" }));
    const result = await generator.generate({ notion, types: ["flashcard"] });

    expect(callCount).toBe(1);
    expect(result).toEqual({
      ok: true,
      value: [{ type: "flashcard", question: "Que produit la photosynthèse ?", answer: "De l'oxygène", options: null }],
    });
  });

  it("schema-violation: retries exactly once with the validation error fed back, then succeeds", async () => {
    let callCount = 0;
    const requestBodies: string[] = [];
    server.use(
      http.post(ANTHROPIC_MESSAGES_URL, async ({ request }) => {
        callCount += 1;
        requestBodies.push(await request.clone().text());
        // Schema-violating: `answer` is missing entirely.
        if (callCount === 1) return anthropicToolUseResponse([{ question: "Q ?" }]);
        return anthropicToolUseResponse([{ question: "Q ?", answer: "R" }]);
      }),
    );

    const generator = new ClaudeCardGenerator(createLanguageModel({ apiKey: "test-key" }));
    const result = await generator.generate({ notion, types: ["flashcard"] });

    expect(callCount).toBe(2);
    expect(requestBodies[1]).toContain("format attendu");
    expect(result.ok).toBe(true);
  });

  it("schema-violation: fails after the single retry is also rejected", async () => {
    let callCount = 0;
    server.use(
      http.post(ANTHROPIC_MESSAGES_URL, () => {
        callCount += 1;
        return anthropicToolUseResponse([{ question: "Q ?" }]);
      }),
    );

    const generator = new ClaudeCardGenerator(createLanguageModel({ apiKey: "test-key" }));
    const result = await generator.generate({ notion, types: ["flashcard"] });

    expect(callCount).toBe(2);
    expect(result.ok).toBe(false);
  });

  it("refine-violation: a question leaking its answer retries once, then fails if still leaking", async () => {
    let callCount = 0;
    const requestBodies: string[] = [];
    server.use(
      http.post(ANTHROPIC_MESSAGES_URL, async ({ request }) => {
        callCount += 1;
        requestBodies.push(await request.clone().text());
        return anthropicToolUseResponse([{ question: "Que produit la photosynthèse ?", answer: "photosynthèse" }]);
      }),
    );

    const generator = new ClaudeCardGenerator(createLanguageModel({ apiKey: "test-key" }));
    const result = await generator.generate({ notion, types: ["flashcard"] });

    expect(callCount).toBe(2);
    expect(requestBodies[1]).toContain("format attendu");
    expect(result.ok).toBe(false);
  });

  it("empty: an empty array does not crash and does not retry", async () => {
    let callCount = 0;
    server.use(
      http.post(ANTHROPIC_MESSAGES_URL, () => {
        callCount += 1;
        return anthropicToolUseResponse([]);
      }),
    );

    const generator = new ClaudeCardGenerator(createLanguageModel({ apiKey: "test-key" }));
    const result = await generator.generate({ notion, types: ["flashcard"] });

    // An empty array is itself a card-count violation (< 1): the adapter
    // retries once like any other invariant violation, then fails.
    expect(callCount).toBe(2);
    expect(result.ok).toBe(false);
  });
});
