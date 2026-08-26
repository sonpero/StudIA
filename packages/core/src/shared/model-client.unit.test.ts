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
