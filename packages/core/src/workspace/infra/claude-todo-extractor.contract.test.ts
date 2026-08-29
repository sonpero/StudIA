// Transport-level (docs/TESTING.md): MSW intercepts the real HTTP call so
// generateObject itself runs — schema-to-JSON-Schema conversion, Anthropic's
// tool-call wire format, and the SDK's own validation/error handling — not
// just a port-level fixture standing in for the whole call.
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createLanguageModel } from "../../shared/index.js";
import { ClaudeTodoExtractor } from "./claude-todo-extractor.js";

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

describe("ClaudeTodoExtractor (transport level, via MSW)", () => {
  it("valid: a schema-conforming tool call on the first attempt does not retry", async () => {
    let callCount = 0;
    server.use(
      http.post(ANTHROPIC_MESSAGES_URL, () => {
        callCount += 1;
        return anthropicToolUseResponse({ todos: [{ label: "Rendre le devoir de maths", dueDate: "2026-03-10", subject: "Maths" }], legible: true });
      }),
    );

    const extractor = new ClaudeTodoExtractor(createLanguageModel({ apiKey: "test-key" }));
    const result = await extractor.extract({ bytes: Buffer.from("fake-photo-bytes"), today: "2026-03-02" });

    expect(callCount).toBe(1);
    expect(result).toEqual({ ok: true, value: { todos: [{ label: "Rendre le devoir de maths", dueDate: "2026-03-10", subject: "Maths" }], legible: true } });
  });

  it("schema-violation: retries exactly once with the validation error fed back, then succeeds on the corrected response (CLAUDE.md rule 4)", async () => {
    let callCount = 0;
    const requestBodies: string[] = [];
    server.use(
      http.post(ANTHROPIC_MESSAGES_URL, async ({ request }) => {
        callCount += 1;
        requestBodies.push(await request.clone().text());
        if (callCount === 1) {
          // Schema-violating: `todos` is a string, `legible` missing.
          return anthropicToolUseResponse({ todos: "not an array" });
        }
        return anthropicToolUseResponse({ todos: [], legible: true });
      }),
    );

    const extractor = new ClaudeTodoExtractor(createLanguageModel({ apiKey: "test-key" }));
    const result = await extractor.extract({ bytes: Buffer.from("fake-photo-bytes"), today: "2026-03-02" });

    expect(callCount).toBe(2);
    expect(requestBodies[1]).toContain("format attendu");
    expect(result).toEqual({ ok: true, value: { todos: [], legible: true } });
  });

  it("schema-violation: fails after the single retry is also rejected", async () => {
    let callCount = 0;
    server.use(
      http.post(ANTHROPIC_MESSAGES_URL, () => {
        callCount += 1;
        return anthropicToolUseResponse({ todos: "still not an array" });
      }),
    );

    const extractor = new ClaudeTodoExtractor(createLanguageModel({ apiKey: "test-key" }));
    const result = await extractor.extract({ bytes: Buffer.from("fake-photo-bytes"), today: "2026-03-02" });

    expect(callCount).toBe(2);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("model-error");
  });

  it("refine-violation: the same task listed twice fails the schema, retries once, then succeeds once deduplicated", async () => {
    let callCount = 0;
    server.use(
      http.post(ANTHROPIC_MESSAGES_URL, () => {
        callCount += 1;
        if (callCount === 1) {
          return anthropicToolUseResponse({
            todos: [
              { label: "Rendre le devoir de maths", dueDate: "2026-03-10", subject: "Maths" },
              { label: "Rendre le devoir de maths", dueDate: "2026-03-10", subject: "Maths" },
            ],
            legible: true,
          });
        }
        return anthropicToolUseResponse({ todos: [{ label: "Rendre le devoir de maths", dueDate: "2026-03-10", subject: "Maths" }], legible: true });
      }),
    );

    const extractor = new ClaudeTodoExtractor(createLanguageModel({ apiKey: "test-key" }));
    const result = await extractor.extract({ bytes: Buffer.from("fake-photo-bytes"), today: "2026-03-02" });

    expect(callCount).toBe(2);
    expect(result).toEqual({ ok: true, value: { todos: [{ label: "Rendre le devoir de maths", dueDate: "2026-03-10", subject: "Maths" }], legible: true } });
  });

  it("degraded: legible:false from the real wire format is a success, not an error", async () => {
    server.use(
      http.post(ANTHROPIC_MESSAGES_URL, () => anthropicToolUseResponse({ todos: [], legible: false, reason: "La photo est trop floue." })),
    );

    const extractor = new ClaudeTodoExtractor(createLanguageModel({ apiKey: "test-key" }));
    const result = await extractor.extract({ bytes: Buffer.from("fake-photo-bytes"), today: "2026-03-02" });

    expect(result).toEqual({ ok: true, value: { todos: [], legible: false, reason: "La photo est trop floue." } });
  });

  it("empty: a legible photo with no tasks does not crash", async () => {
    server.use(http.post(ANTHROPIC_MESSAGES_URL, () => anthropicToolUseResponse({ todos: [], legible: true })));

    const extractor = new ClaudeTodoExtractor(createLanguageModel({ apiKey: "test-key" }));
    const result = await extractor.extract({ bytes: Buffer.from("fake-photo-bytes"), today: "2026-03-02" });

    expect(result).toEqual({ ok: true, value: { todos: [], legible: true } });
  });
});
