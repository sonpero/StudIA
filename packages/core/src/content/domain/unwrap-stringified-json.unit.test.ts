import { describe, expect, it } from "vitest";
import { unwrapStringifiedJson } from "./unwrap-stringified-json.js";

describe("unwrapStringifiedJson", () => {
  it("parses a top-level field the model returned as a JSON-encoded array", () => {
    const text = JSON.stringify({ elements: JSON.stringify([{ title: "A", body: "B", difficulty: "easy" }]) });
    expect(JSON.parse(unwrapStringifiedJson(text) ?? "null")).toEqual({ elements: [{ title: "A", body: "B", difficulty: "easy" }] });
  });

  it("also unwraps a JSON-encoded object", () => {
    expect(JSON.parse(unwrapStringifiedJson('{"a":"{\\"b\\":1}"}') ?? "null")).toEqual({ a: { b: 1 } });
  });

  it("returns null when there is nothing to unwrap, so the original error stands", () => {
    expect(unwrapStringifiedJson('{"elements":[{"title":"A"}]}')).toBeNull();
    expect(unwrapStringifiedJson('{"title":"[pas du JSON"}')).toBeNull();
    expect(unwrapStringifiedJson("not json")).toBeNull();
    expect(unwrapStringifiedJson("[1,2]")).toBeNull();
  });
});
