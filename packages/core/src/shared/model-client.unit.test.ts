import { describe, expect, it } from "vitest";
import { createLanguageModel } from "./model-client.js";

describe("createLanguageModel", () => {
  it("builds a language model for the given model id without making any network call", () => {
    const model = createLanguageModel({ apiKey: "test-key", model: "claude-sonnet-4-5" });

    expect(model.modelId).toBe("claude-sonnet-4-5");
    expect(model.provider).toContain("anthropic");
  });

  it("defaults to a sensible model id when none is given", () => {
    const model = createLanguageModel({ apiKey: "test-key" });

    expect(model.modelId.length).toBeGreaterThan(0);
  });
});

describe("createLanguageModel model selection", () => {
  it("defaults to claude-sonnet-5", () => {
    expect(createLanguageModel({ apiKey: "test-key" }).modelId).toBe("claude-sonnet-5");
  });

  // Railway and .env files set a variable to "" rather than leaving it
  // unset; a blank LLM_MODEL must mean "use the default", not model "".
  it("falls back to the default when the configured model is blank", () => {
    expect(createLanguageModel({ apiKey: "test-key", model: "" }).modelId).toBe("claude-sonnet-5");
    expect(createLanguageModel({ apiKey: "test-key", model: "   " }).modelId).toBe("claude-sonnet-5");
  });

  it("trims a configured model id", () => {
    expect(createLanguageModel({ apiKey: "test-key", model: " claude-sonnet-4-6 " }).modelId).toBe("claude-sonnet-4-6");
  });
});
