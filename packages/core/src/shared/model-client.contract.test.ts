// Transport level (docs/TESTING.md): MSW captures the exact body the SDK
// sends. ai@4.3.19 defaults `temperature` to 0 on every call, and
// claude-sonnet-5 rejects any non-default temperature/top_p/top_k with a
// 400 — this pins that the factory's model never puts them on the wire.
import { generateObject, generateText } from "ai";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { createLanguageModel } from "./model-client.js";

const ANTHROPIC_MESSAGES_URL = "https://api.anthropic.com/v1/messages";

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function captureBodies(response: () => Response): Record<string, unknown>[] {
  const bodies: Record<string, unknown>[] = [];
  server.use(
    http.post(ANTHROPIC_MESSAGES_URL, async ({ request }) => {
      bodies.push((await request.json()) as Record<string, unknown>);
      return response();
    }),
  );
  return bodies;
}

const usage = { input_tokens: 1, output_tokens: 1 };

describe("createLanguageModel request body", () => {
  it("generateObject sends the default model and no sampling parameter", async () => {
    const bodies = captureBodies(() =>
      HttpResponse.json({
        id: "msg_test",
        type: "message",
        role: "assistant",
        model: "claude-sonnet-5",
        content: [{ type: "tool_use", id: "toolu_1", name: "json", input: { title: "x" } }],
        stop_reason: "tool_use",
        usage,
      }),
    );

    await generateObject({
      model: createLanguageModel({ apiKey: "test-key" }),
      schema: z.object({ title: z.string() }),
      prompt: "p",
      maxTokens: 100,
    });

    expect(bodies).toHaveLength(1);
    expect(bodies[0]?.model).toBe("claude-sonnet-5");
    expect(bodies[0]?.max_tokens).toBe(100);
    expect(bodies[0]).not.toHaveProperty("temperature");
    expect(bodies[0]).not.toHaveProperty("top_p");
    expect(bodies[0]).not.toHaveProperty("top_k");
  });

  it("generateText sends no sampling parameter either", async () => {
    const bodies = captureBodies(() =>
      HttpResponse.json({
        id: "msg_test",
        type: "message",
        role: "assistant",
        model: "claude-sonnet-5",
        content: [{ type: "text", text: "ok" }],
        stop_reason: "end_turn",
        usage,
      }),
    );

    await generateText({ model: createLanguageModel({ apiKey: "test-key", model: "claude-sonnet-4-6" }), prompt: "p" });

    expect(bodies[0]?.model).toBe("claude-sonnet-4-6");
    expect(bodies[0]).not.toHaveProperty("temperature");
    expect(bodies[0]).not.toHaveProperty("top_p");
    expect(bodies[0]).not.toHaveProperty("top_k");
  });
});
