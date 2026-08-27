// Transport-level (docs/TESTING.md): MSW intercepts the real HTTP call so
// generateObject itself runs — schema-to-JSON-Schema conversion, Anthropic's
// tool-call wire format, and the SDK's own validation/error handling — not
// just a port-level fixture standing in for the whole call. The request/
// response shape below (tool name "json", array wrapped as `{ elements: [...] }`
// in `input`) was captured empirically from a real generateObject call with
// `output: 'array'` against @ai-sdk/anthropic, not guessed from memory.
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createLanguageModel } from "../../shared/index.js";
import { ClaudeNotionSplitter } from "./claude-notion-splitter.js";

const ANTHROPIC_MESSAGES_URL = "https://api.anthropic.com/v1/messages";

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

describe("ClaudeNotionSplitter (transport level, via MSW)", () => {
  it("valid: a schema-conforming tool call on the first attempt does not retry", async () => {
    let callCount = 0;
    server.use(
      http.post(ANTHROPIC_MESSAGES_URL, () => {
        callCount += 1;
        return anthropicToolUseResponse([{ title: "Photosynthèse", body: "Corps.", difficulty: "medium" }]);
      }),
    );

    const splitter = new ClaudeNotionSplitter(createLanguageModel({ apiKey: "test-key" }));
    const result = await splitter.split({ markdown: "# Cours" });

    expect(callCount).toBe(1);
    expect(result).toEqual({ ok: true, value: [{ title: "Photosynthèse", body: "Corps.", difficulty: "medium" }] });
  });

  it("schema-violation: retries exactly once with the validation error fed back, then succeeds on the corrected response", async () => {
    let callCount = 0;
    const requestBodies: string[] = [];
    server.use(
      http.post(ANTHROPIC_MESSAGES_URL, async ({ request }) => {
        callCount += 1;
        requestBodies.push(await request.clone().text());
        if (callCount === 1) {
          // Schema-violating: `difficulty` is not one of the allowed enum
          // values — exactly what triggers the SDK's own AI_TypeValidationError.
          return anthropicToolUseResponse([{ title: "Photosynthèse", body: "Corps.", difficulty: "impossible" }]);
        }
        return anthropicToolUseResponse([{ title: "Photosynthèse", body: "Corps.", difficulty: "medium" }]);
      }),
    );

    const splitter = new ClaudeNotionSplitter(createLanguageModel({ apiKey: "test-key" }));
    const result = await splitter.split({ markdown: "# Cours" });

    expect(callCount).toBe(2);
    expect(requestBodies[1]).toContain("format attendu");
    expect(result).toEqual({ ok: true, value: [{ title: "Photosynthèse", body: "Corps.", difficulty: "medium" }] });
  });

  it("schema-violation: fails after the single retry is also rejected", async () => {
    let callCount = 0;
    server.use(
      http.post(ANTHROPIC_MESSAGES_URL, () => {
        callCount += 1;
        return anthropicToolUseResponse([{ title: "T", body: "B", difficulty: "impossible" }]);
      }),
    );

    const splitter = new ClaudeNotionSplitter(createLanguageModel({ apiKey: "test-key" }));
    const result = await splitter.split({ markdown: "# Cours" });

    expect(callCount).toBe(2);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("model-error");
  });

  it("refine-violation: duplicate titles in one response retries once, then fails if still duplicated", async () => {
    let callCount = 0;
    const requestBodies: string[] = [];
    server.use(
      http.post(ANTHROPIC_MESSAGES_URL, async ({ request }) => {
        callCount += 1;
        requestBodies.push(await request.clone().text());
        return anthropicToolUseResponse([
          { title: "Photosynthèse", body: "Corps A.", difficulty: "medium" },
          { title: "photosynthèse", body: "Corps B.", difficulty: "easy" },
        ]);
      }),
    );

    const splitter = new ClaudeNotionSplitter(createLanguageModel({ apiKey: "test-key" }));
    const result = await splitter.split({ markdown: "# Cours" });

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

    const splitter = new ClaudeNotionSplitter(createLanguageModel({ apiKey: "test-key" }));
    const result = await splitter.split({ markdown: "" });

    expect(callCount).toBe(1);
    expect(result).toEqual({ ok: true, value: [] });
  });
});
