// Transport-level (docs/TESTING.md): MSW intercepts the real HTTP call so
// streamText itself runs -- the SSE event framing, Anthropic's streaming
// wire format, and the SDK's own chunk parsing, not just a port-level
// fixture standing in for the whole call. The event sequence below
// (message_start, content_block_start, a ping, content_block_delta per
// chunk, content_block_stop, message_delta, message_stop) was captured
// empirically from one real streaming call against the Anthropic API with
// stream: true, not guessed from memory -- same reasoning as
// claude-notion-splitter.contract.test.ts's request/response shape.
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createLanguageModel } from "../../shared/index.js";
import type { Section } from "../domain/types.js";
import { ClaudeChatModel } from "./claude-chat-model.js";

const ANTHROPIC_MESSAGES_URL = "https://api.anthropic.com/v1/messages";

const SECTIONS: Section[] = [
  { index: 0, text: "La photosynthèse convertit la lumière en énergie chimique." },
  { index: 1, text: "Elle se déroule dans les chloroplastes des cellules végétales." },
];

function anthropicStreamResponse(chunks: string[]) {
  const events = [
    { event: "message_start", data: { type: "message_start", message: { model: "claude-sonnet-4-5-20250929", id: "msg_test", type: "message", role: "assistant", content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 10, output_tokens: 1 } } } },
    { event: "content_block_start", data: { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } } },
    { event: "ping", data: { type: "ping" } },
    ...chunks.map((text) => ({ event: "content_block_delta", data: { type: "content_block_delta", index: 0, delta: { type: "text_delta", text } } })),
    { event: "content_block_stop", data: { type: "content_block_stop", index: 0 } },
    { event: "message_delta", data: { type: "message_delta", delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: chunks.length } } },
    { event: "message_stop", data: { type: "message_stop" } },
  ];
  const body = events.map((e) => `event: ${e.event}\ndata: ${JSON.stringify(e.data)}\n`).join("\n") + "\n";
  return new HttpResponse(body, { headers: { "Content-Type": "text/event-stream" } });
}

async function collect(stream: AsyncIterable<string>): Promise<string[]> {
  const chunks: string[] = [];
  for await (const chunk of stream) chunks.push(chunk);
  return chunks;
}

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe("ClaudeChatModel (transport level, via MSW)", () => {
  it("valid: yields the model's text chunk by chunk, in order", async () => {
    server.use(http.post(ANTHROPIC_MESSAGES_URL, () => anthropicStreamResponse(["La", " photosynthèse", " est un processus."])));

    const chatModel = new ClaudeChatModel(createLanguageModel({ apiKey: "test-key" }));
    const chunks = await collect(chatModel.stream({ question: "Explique.", sections: SECTIONS, history: [] }));

    expect(chunks).toEqual(["La", " photosynthèse", " est un processus."]);
  });

  it("sends the course sections and the question as the request body", async () => {
    let requestBody = "";
    server.use(
      http.post(ANTHROPIC_MESSAGES_URL, async ({ request }) => {
        requestBody = await request.clone().text();
        return anthropicStreamResponse(["Réponse."]);
      }),
    );

    const chatModel = new ClaudeChatModel(createLanguageModel({ apiKey: "test-key" }));
    await collect(chatModel.stream({ question: "Qu'est-ce que la photosynthèse ?", sections: SECTIONS, history: [] }));

    expect(requestBody).toContain("chloroplastes");
    expect(requestBody).toContain("Qu'est-ce que la photosynthèse ?");
  });

  it("sends prior conversation history as prior messages, not folded into the question", async () => {
    let requestBody = "";
    server.use(
      http.post(ANTHROPIC_MESSAGES_URL, async ({ request }) => {
        requestBody = await request.clone().text();
        return anthropicStreamResponse(["Réponse."]);
      }),
    );

    const chatModel = new ClaudeChatModel(createLanguageModel({ apiKey: "test-key" }));
    await collect(
      chatModel.stream({
        question: "Et la phase sombre ?",
        sections: SECTIONS,
        history: [
          { role: "user", content: "Qu'est-ce que la phase claire ?" },
          { role: "assistant", content: "C'est la première étape." },
        ],
      }),
    );

    // @ai-sdk/anthropic converts a plain string `content` into Anthropic's
    // structured content-block format on the wire -- observed here, not
    // guessed: the point of a transport-level test.
    const parsed = JSON.parse(requestBody) as { messages: { role: string; content: { type: string; text: string }[] }[] };
    expect(parsed.messages).toEqual([
      { role: "user", content: [{ type: "text", text: "Qu'est-ce que la phase claire ?" }] },
      { role: "assistant", content: [{ type: "text", text: "C'est la première étape." }] },
      { role: "user", content: [{ type: "text", text: "Et la phase sombre ?" }] },
    ]);
  });
});
