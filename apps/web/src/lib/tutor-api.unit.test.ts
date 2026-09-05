import { afterEach, describe, expect, it, vi } from "vitest";
import { askStream, parseSseEvent } from "./tutor-api.js";

describe("parseSseEvent", () => {
  it("parses a chunk event", () => {
    expect(parseSseEvent('event: chunk\ndata: {"text":"La photo"}')).toEqual({ type: "chunk", text: "La photo" });
  });

  it("parses a done event with citations and grounded", () => {
    expect(parseSseEvent('event: done\ndata: {"citations":[{"text":"Passage cité."}],"grounded":true}')).toEqual({
      type: "done",
      citations: [{ text: "Passage cité." }],
      grounded: true,
    });
  });

  it("parses a done event with no citations (a refusal)", () => {
    expect(parseSseEvent('event: done\ndata: {"citations":[],"grounded":false}')).toEqual({ type: "done", citations: [], grounded: false });
  });

  it("parses a partial event", () => {
    expect(parseSseEvent("event: partial\ndata: {}")).toEqual({ type: "partial" });
  });

  it("returns null for a block missing an event or data line", () => {
    expect(parseSseEvent("data: {}")).toBeNull();
    expect(parseSseEvent("event: chunk")).toBeNull();
    expect(parseSseEvent("")).toBeNull();
  });
});

function sseResponse(body: string, init: { status?: number } = {}): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(body));
      controller.close();
    },
  });
  return new Response(stream, { status: init.status ?? 200 });
}

describe("askStream", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("yields chunk events in order, then the done event", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        sseResponse(
          'event: chunk\ndata: {"text":"La"}\n\nevent: chunk\ndata: {"text":" photosynthèse"}\n\nevent: done\ndata: {"citations":[{"text":"Un passage."}],"grounded":true}\n\n',
        ),
      ),
    );

    const events = [];
    for await (const event of askStream("c1", "Une question ?")) events.push(event);

    expect(events).toEqual([
      { type: "chunk", text: "La" },
      { type: "chunk", text: " photosynthèse" },
      { type: "done", citations: [{ text: "Un passage." }], grounded: true },
    ]);
  });

  it("yields a partial event when the stream ends that way", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(sseResponse('event: chunk\ndata: {"text":"Voici le début"}\n\nevent: partial\ndata: {}\n\n')));

    const events = [];
    for await (const event of askStream("c1", "Une question ?")) events.push(event);

    expect(events).toEqual([{ type: "chunk", text: "Voici le début" }, { type: "partial" }]);
  });

  it("handles a chunk split across two stream reads (event boundary mid-buffer)", async () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('event: chunk\ndata: {"te'));
        controller.enqueue(encoder.encode('xt":"La photo"}\n\nevent: done\ndata: {"citations":[],"grounded":false}\n\n'));
        controller.close();
      },
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(stream, { status: 200 })));

    const events = [];
    for await (const event of askStream("c1", "Une question ?")) events.push(event);

    expect(events).toEqual([{ type: "chunk", text: "La photo" }, { type: "done", citations: [], grounded: false }]);
  });

  it("throws when the request itself fails, before yielding anything", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "document-not-ready" }), { status: 409 })));

    const iterator = askStream("c1", "Une question ?");
    await expect(iterator.next()).rejects.toThrow();
  });
});
