// Transport level (docs/TESTING.md): MSW intercepts the real HTTP call so
// generateObject runs; output "array" wraps the list as { elements: [...] }.
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createLanguageModel } from "../../shared/index.js";
import type { CardBatchInput } from "../domain/ports.js";
import { ClaudeKeyNotionCardGenerator, CARD_BATCH_MAX_TOKENS } from "./claude-key-notion-card-generator.js";

const ANTHROPIC_MESSAGES_URL = "https://api.anthropic.com/v1/messages";

function toolResponse(elements: unknown[]) {
  return HttpResponse.json({
    id: "msg_test",
    type: "message",
    role: "assistant",
    model: "claude-sonnet-5",
    content: [{ type: "tool_use", id: "toolu_1", name: "json", input: { elements } }],
    stop_reason: "tool_use",
    usage: { input_tokens: 10, output_tokens: 5 },
  });
}

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function record(responses: unknown[][]) {
  const bodies: string[] = [];
  server.use(
    http.post(ANTHROPIC_MESSAGES_URL, async ({ request }) => {
      bodies.push(await request.clone().text());
      return toolResponse(responses[Math.min(bodies.length - 1, responses.length - 1)]!);
    }),
  );
  return bodies;
}

const batch = (type: CardBatchInput["type"]): CardBatchInput => ({
  type,
  keyNotions: [
    { index: 3, title: "Agent Card", summary: "Une carte décrit un agent.", readingNotionIds: ["uuid-a"] },
    { index: 7, title: "Cycle de vie des tâches", summary: "Une tâche passe par des états.", readingNotionIds: ["uuid-b", "uuid-a"] },
  ],
  readingNotions: [
    { id: "uuid-a", title: "Découverte", body: "L'Agent Card est publiée à une URI connue." },
    { id: "uuid-b", title: "États", body: "SUBMITTED, WORKING, COMPLETED." },
  ],
});

const generator = () => new ClaudeKeyNotionCardGenerator(createLanguageModel({ apiKey: "test-key" }));
const mcq = (keyNotion: string, overrides: Record<string, unknown> = {}) => ({
  keyNotion,
  question: "Où est publiée l'Agent Card ?",
  options: ["À une URI connue", "Dans un registre", "Dans le message", "Dans la tâche"],
  answer: "À une URI connue",
  ...overrides,
});

describe("ClaudeKeyNotionCardGenerator (transport level, via MSW)", () => {
  it("valid: one call, each card mapped back to its key notion's index", async () => {
    const bodies = record([
      [
        { keyNotion: "K4", question: "Que décrit l'Agent Card ?", answer: "Un agent" },
        { keyNotion: "K8", question: "Quel est le premier état d'une tâche ?", answer: "SUBMITTED" },
      ],
    ]);

    const result = await generator().generate(batch("flashcard"));

    expect(bodies).toHaveLength(1);
    expect(result).toEqual({
      ok: true,
      value: [
        { keyNotionIndex: 3, type: "flashcard", question: "Que décrit l'Agent Card ?", answer: "Un agent", options: null },
        { keyNotionIndex: 7, type: "flashcard", question: "Quel est le premier état d'une tâche ?", answer: "SUBMITTED", options: null },
      ],
    });
  });

  it("sends each key notion with its summary and sources, the sources' text once, and an explicit max_tokens", async () => {
    const bodies = record([[mcq("K4"), mcq("K8", { question: "Quel état suit SUBMITTED ?", options: ["WORKING", "FAILED", "CANCELED", "REJECTED"], answer: "WORKING" })]]);
    await generator().generate(batch("mcq"));

    const body = JSON.parse(bodies[0]!) as { max_tokens: number; messages: { content: { text: string }[] }[] };
    const prompt = body.messages[0]!.content.map((c) => c.text).join("");
    expect(body.max_tokens).toBe(CARD_BATCH_MAX_TOKENS);
    expect(prompt).toContain("K4 — Agent Card");
    expect(prompt).toContain("K8 — Cycle de vie des tâches");
    expect(prompt.match(/L'Agent Card est publiée à une URI connue\./g)).toHaveLength(1);
    expect(prompt).toContain("toutes les réponses ci-dessus");
  });

  it("mcq: stores the answer as the exact text of the matching option", async () => {
    record([[mcq("K4", { answer: "  à une uri connue " }), mcq("K8", { question: "Quel état suit SUBMITTED ?", options: ["WORKING", "FAILED", "CANCELED", "REJECTED"], answer: "WORKING" })]]);
    const result = await generator().generate(batch("mcq"));
    expect(result.ok && result.value[0]?.answer).toBe("À une URI connue");
  });

  it("refine-violation: an invalid MCQ is asked for again, alone, with the reason, then merged", async () => {
    const goodSecond = mcq("K8", { question: "Quel état suit SUBMITTED ?", options: ["WORKING", "FAILED", "CANCELED", "REJECTED"], answer: "WORKING" });
    const bodies = record([[mcq("K4", { answer: "Absente des options" }), goodSecond], [mcq("K4")]]);

    const result = await generator().generate(batch("mcq"));

    expect(bodies).toHaveLength(2);
    expect(bodies[1]).toContain("K4");
    expect(bodies[1]).not.toContain("K8 — Cycle de vie");
    expect(bodies[1]).toContain("format attendu");
    expect(result.ok && result.value.map((c) => c.keyNotionIndex)).toEqual([7, 3]);
  });

  it("rejects a position-dependent option and a distractor of very different length", async () => {
    record([
      [
        mcq("K4", { options: ["À une URI connue", "Dans un registre", "Dans le message", "Toutes les réponses ci-dessus"] }),
        mcq("K8", { options: ["À une URI connue", "Non", "Dans le message", "Dans la tâche"] }),
      ],
    ]);
    const result = await generator().generate(batch("mcq"));
    expect(result).toMatchObject({ ok: false, error: { kind: "model-error" } });
  });

  it("rejects a question that leaks its answer", async () => {
    record([[{ keyNotion: "K4", question: "L'Agent Card décrit-elle un agent ?", answer: "agent card" }, { keyNotion: "K8", question: "Premier état ?", answer: "SUBMITTED" }]]);
    expect((await generator().generate(batch("flashcard"))).ok).toBe(false);
  });

  it("a key notion left without a card after the retry fails the call", async () => {
    const bodies = record([[{ keyNotion: "K4", question: "Q ?", answer: "R" }]]);
    const result = await generator().generate(batch("open"));
    expect(bodies).toHaveLength(2);
    expect(result).toMatchObject({ ok: false, error: { kind: "model-error" } });
  });

  it("ignores a card pointing to a key notion outside the batch, and a second card for the same one", async () => {
    record([
      [
        { keyNotion: "K4", question: "Q1 ?", answer: "R1" },
        { keyNotion: "K4", question: "Q2 ?", answer: "R2" },
        { keyNotion: "K99", question: "Q3 ?", answer: "R3" },
        { keyNotion: "K8", question: "Q4 ?", answer: "R4" },
      ],
    ]);
    const result = await generator().generate(batch("open"));
    expect(result.ok && result.value.map((c) => c.question)).toEqual(["Q1 ?", "Q4 ?"]);
  });

  it("schema-violation: retries the whole batch once, then fails", async () => {
    const bodies = record([[{ keyNotion: "K4" }]]);
    const result = await generator().generate(batch("flashcard"));
    expect(bodies).toHaveLength(2);
    expect(result).toMatchObject({ ok: false, error: { kind: "model-error" } });
  });

  it("empty: an empty list does not crash; it is retried, then fails", async () => {
    const bodies = record([[]]);
    const result = await generator().generate(batch("flashcard"));
    expect(bodies).toHaveLength(2);
    expect(result.ok).toBe(false);
  });
});
