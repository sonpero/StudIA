import { describe, expect, it } from "vitest";
import { FixtureChatModel } from "./fixture-chat-model.js";

async function collect(stream: AsyncIterable<string>): Promise<string[]> {
  const chunks: string[] = [];
  for await (const chunk of stream) chunks.push(chunk);
  return chunks;
}

const INPUT = { question: "Qu'est-ce que la photosynthèse ?", sections: [], history: [] };

describe("FixtureChatModel", () => {
  it("valid: streams more than one chunk", async () => {
    const model = new FixtureChatModel("valid");
    const chunks = await collect(model.stream(INPUT));
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.join("")).not.toBe("");
  });

  it("refusal: streams a plain refusal, not an error", async () => {
    const model = new FixtureChatModel("refusal");
    const chunks = await collect(model.stream(INPUT));
    expect(chunks.join("")).toContain("n'aborde pas");
  });

  it("mid-stream-failure: yields some chunks then throws, never resolving", async () => {
    const model = new FixtureChatModel("mid-stream-failure");
    const chunks: string[] = [];
    await expect(async () => {
      for await (const chunk of model.stream(INPUT)) chunks.push(chunk);
    }).rejects.toThrow();
    expect(chunks.length).toBeGreaterThan(0);
  });

  it("empty: yields nothing and does not crash", async () => {
    const model = new FixtureChatModel("empty");
    const chunks = await collect(model.stream(INPUT));
    expect(chunks).toEqual([]);
  });
});
