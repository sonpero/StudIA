// Transport-level (docs/TESTING.md): MSW intercepts the real HTTP call so
// generateObject itself runs — schema-to-JSON-Schema conversion, Anthropic's
// tool-call wire format, and the SDK's own validation/error handling — not
// just a port-level fixture standing in for the whole call. The request/
// response shapes below were captured empirically from a real generateObject
// call against @ai-sdk/anthropic (Messages API, tool-choice mode), not
// guessed from memory.
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createLanguageModel } from "../../shared/index.js";
import { VisionExtractor } from "./vision-extractor.js";

const ANTHROPIC_MESSAGES_URL = "https://api.anthropic.com/v1/messages";

function anthropicToolUseResponse(input: unknown) {
  return HttpResponse.json({
    id: "msg_test",
    type: "message",
    role: "assistant",
    model: "claude-sonnet-4-5",
    content: [{ type: "tool_use", id: "toolu_1", name: "json", input }],
    stop_reason: "tool_use",
    usage: { input_tokens: 10, output_tokens: 5 },
  });
}

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe("VisionExtractor (transport level, via MSW)", () => {
  it("schema-violation: retries exactly once with the validation error fed back, then succeeds on the corrected response (CLAUDE.md rule 4)", async () => {
    let callCount = 0;
    const requestBodies: string[] = [];
    server.use(
      http.post(ANTHROPIC_MESSAGES_URL, async ({ request }) => {
        callCount += 1;
        requestBodies.push(await request.clone().text());
        if (callCount === 1) {
          // Schema-violating: `markdown` is a number, `legible` missing —
          // exactly what triggers the SDK's own AI_TypeValidationError.
          return anthropicToolUseResponse({ markdown: 123 });
        }
        return anthropicToolUseResponse({ markdown: "# Cours\n\nContenu.", legible: true });
      }),
    );

    const extractor = new VisionExtractor(createLanguageModel({ apiKey: "test-key" }));
    const result = await extractor.extract({ bytes: Buffer.from("fake-photo-bytes"), sourceType: "photo" });

    expect(callCount).toBe(2);
    expect(requestBodies[1]).toContain("format attendu");
    expect(result).toEqual({ ok: true, value: { markdown: "# Cours\n\nContenu.", legible: true } });
  });

  it("schema-violation: fails the job after the single retry is also rejected", async () => {
    let callCount = 0;
    server.use(
      http.post(ANTHROPIC_MESSAGES_URL, () => {
        callCount += 1;
        // Both attempts violate the schema.
        return anthropicToolUseResponse({ markdown: 123 });
      }),
    );

    const extractor = new VisionExtractor(createLanguageModel({ apiKey: "test-key" }));
    const result = await extractor.extract({ bytes: Buffer.from("fake-photo-bytes"), sourceType: "photo" });

    expect(callCount).toBe(2);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("model-error");
  });

  it("valid: a schema-conforming tool call on the first attempt does not retry", async () => {
    let callCount = 0;
    server.use(
      http.post(ANTHROPIC_MESSAGES_URL, () => {
        callCount += 1;
        return anthropicToolUseResponse({ markdown: "# Titre\n\nTexte.", legible: true });
      }),
    );

    const extractor = new VisionExtractor(createLanguageModel({ apiKey: "test-key" }));
    const result = await extractor.extract({ bytes: Buffer.from("fake-photo-bytes"), sourceType: "photo" });

    expect(callCount).toBe(1);
    expect(result).toEqual({ ok: true, value: { markdown: "# Titre\n\nTexte.", legible: true } });
  });

  it("degraded: legible:false from the real wire format is a success, not an error", async () => {
    server.use(
      http.post(ANTHROPIC_MESSAGES_URL, () =>
        anthropicToolUseResponse({ markdown: "", legible: false, reason: "La photo est trop floue." }),
      ),
    );

    const extractor = new VisionExtractor(createLanguageModel({ apiKey: "test-key" }));
    const result = await extractor.extract({ bytes: Buffer.from("fake-photo-bytes"), sourceType: "photo" });

    expect(result).toEqual({ ok: true, value: { markdown: "", legible: false, reason: "La photo est trop floue." } });
  });
});
