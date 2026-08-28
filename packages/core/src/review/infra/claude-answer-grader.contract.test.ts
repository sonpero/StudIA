// Transport-level (docs/TESTING.md): MSW intercepts the real HTTP call so
// generateObject itself runs, same pattern as vision-extractor.contract.test.ts.
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createLanguageModel } from "../../shared/index.js";
import { ClaudeAnswerGrader } from "./claude-answer-grader.js";

const ANTHROPIC_MESSAGES_URL = "https://api.anthropic.com/v1/messages";
const input = { question: "Explique le rôle de la chlorophylle.", expected: "Elle capte la lumière pour la photosynthèse.", given: "Elle transforme la lumière en énergie." };

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

describe("ClaudeAnswerGrader (transport level, via MSW)", () => {
  it("valid: a schema-conforming tool call on the first attempt does not retry", async () => {
    let callCount = 0;
    server.use(
      http.post(ANTHROPIC_MESSAGES_URL, () => {
        callCount += 1;
        return anthropicToolUseResponse({ correct: true, feedback: "Exact, bien formulé.", verdict: "good" });
      }),
    );

    const grader = new ClaudeAnswerGrader(createLanguageModel({ apiKey: "test-key" }));
    const result = await grader.grade(input);

    expect(callCount).toBe(1);
    expect(result).toEqual({ ok: true, value: { correct: true, feedback: "Exact, bien formulé.", suggestedRating: 3 } });
  });

  it("maps every verdict to its FSRS rating: again=1, hard=2, good=3, easy=4", async () => {
    const grader = new ClaudeAnswerGrader(createLanguageModel({ apiKey: "test-key" }));
    const cases: [string, number][] = [
      ["again", 1],
      ["hard", 2],
      ["good", 3],
      ["easy", 4],
    ];
    for (const [verdict, rating] of cases) {
      server.use(
        http.post(ANTHROPIC_MESSAGES_URL, () => anthropicToolUseResponse({ correct: verdict !== "again", feedback: "f", verdict })),
      );
      const result = await grader.grade(input);
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value.suggestedRating).toBe(rating);
    }
  });

  it("schema-violation: retries exactly once with the validation error fed back, then succeeds", async () => {
    let callCount = 0;
    const requestBodies: string[] = [];
    server.use(
      http.post(ANTHROPIC_MESSAGES_URL, async ({ request }) => {
        callCount += 1;
        requestBodies.push(await request.clone().text());
        // Schema-violating: `verdict` is not one of the enum values.
        if (callCount === 1) return anthropicToolUseResponse({ correct: true, feedback: "f", verdict: "perfect" });
        return anthropicToolUseResponse({ correct: true, feedback: "f", verdict: "good" });
      }),
    );

    const grader = new ClaudeAnswerGrader(createLanguageModel({ apiKey: "test-key" }));
    const result = await grader.grade(input);

    expect(callCount).toBe(2);
    expect(requestBodies[1]).toContain("format attendu");
    expect(result.ok).toBe(true);
  });

  it("schema-violation: fails after the single retry is also rejected", async () => {
    let callCount = 0;
    server.use(
      http.post(ANTHROPIC_MESSAGES_URL, () => {
        callCount += 1;
        return anthropicToolUseResponse({ correct: true, feedback: "f", verdict: "perfect" });
      }),
    );

    const grader = new ClaudeAnswerGrader(createLanguageModel({ apiKey: "test-key" }));
    const result = await grader.grade(input);

    expect(callCount).toBe(2);
    expect(result.ok).toBe(false);
  });

  // The key contract per docs/modules/review.md: a correct answer phrased
  // differently from the expected one must not be marked wrong. This is a
  // model-judgement concern, not something the schema can enforce — the
  // fixture adapter covers it deterministically; this just confirms the
  // real adapter passes the model's own verdict through unmodified.
  it("passes the model's correct/incorrect verdict through without second-guessing it", async () => {
    server.use(
      http.post(ANTHROPIC_MESSAGES_URL, () =>
        anthropicToolUseResponse({ correct: true, feedback: "Reformulé différemment mais juste.", verdict: "good" }),
      ),
    );

    const grader = new ClaudeAnswerGrader(createLanguageModel({ apiKey: "test-key" }));
    const result = await grader.grade(input);

    expect(result).toEqual({ ok: true, value: { correct: true, feedback: "Reformulé différemment mais juste.", suggestedRating: 3 } });
  });
});
