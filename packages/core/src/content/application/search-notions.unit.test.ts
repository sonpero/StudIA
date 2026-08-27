import { describe, expect, it } from "vitest";
import { fakeNotionRepository } from "./fakes.js";
import { searchNotions } from "./search-notions.js";
import type { Notion } from "../domain/types.js";

const now = new Date("2026-01-01T00:00:00.000Z");

function aNotion(overrides: Partial<Notion> = {}): Notion {
  return {
    id: "n1",
    documentId: "doc-1",
    userId: "u1",
    title: "Photosynthèse",
    body: "Corps.",
    difficulty: "medium",
    position: 0,
    createdAt: now.toISOString(),
    ...overrides,
  };
}

describe("searchNotions", () => {
  it("searches only within the caller's own notions", async () => {
    const repo = fakeNotionRepository([aNotion({ id: "n1" }), aNotion({ id: "n2", userId: "u2" })]);

    const results = await searchNotions({ repo }, "u1", "photosynthèse");

    expect(results.map((n) => n.id)).toEqual(["n1"]);
  });
});
