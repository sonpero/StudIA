import { describe, expect, it } from "vitest";
import { FixtureTodoExtractor } from "./fixture-todo-extractor.js";

const input = { bytes: Buffer.from("x"), today: "2026-03-02" };

describe("FixtureTodoExtractor", () => {
  it("valid: returns a non-empty list of todos, legible", async () => {
    const extractor = new FixtureTodoExtractor("valid");
    const result = await extractor.extract(input);
    expect(result.ok).toBe(true);
    expect(result.ok && result.value.todos.length).toBeGreaterThan(0);
    expect(result.ok && result.value.legible).toBe(true);
  });

  it("degraded: a legitimate but poor result (illegible) is a result, not an error", async () => {
    const extractor = new FixtureTodoExtractor("degraded");
    const result = await extractor.extract(input);
    expect(result.ok).toBe(true);
    expect(result.ok && result.value.legible).toBe(false);
    expect(result.ok && result.value.reason).toBeTruthy();
  });

  it("empty: a legible photo with no todos does not crash and is still a successful result", async () => {
    const extractor = new FixtureTodoExtractor("empty");
    const result = await extractor.extract(input);
    expect(result).toEqual({ ok: true, value: { todos: [], legible: true } });
  });

  it("schema-violation: surfaces as a model-error after the (simulated) retry is exhausted", async () => {
    const extractor = new FixtureTodoExtractor("schema-violation");
    const result = await extractor.extract(input);
    expect(result.ok).toBe(false);
    expect(result.ok || result.error.kind).toBe("model-error");
  });

  it("refine-violation: surfaces as a model-error, distinct from a schema-violation", async () => {
    const extractor = new FixtureTodoExtractor("refine-violation");
    const result = await extractor.extract(input);
    expect(result.ok).toBe(false);
    expect(result.ok || result.error.message).toContain("refine");
  });
});
