import { describe, expect, it } from "vitest";
import { uuidV7Generator } from "./id.js";

const UUID_V7_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe("uuidV7Generator", () => {
  it("produces a well-formed UUID v7 (version and variant nibbles set)", () => {
    expect(uuidV7Generator.next()).toMatch(UUID_V7_PATTERN);
  });

  it("never produces the same id twice across many calls", () => {
    const ids = new Set(Array.from({ length: 1000 }, () => uuidV7Generator.next()));
    expect(ids.size).toBe(1000);
  });
});
