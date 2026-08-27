import { describe, expect, it } from "vitest";
import { fakeNotionRepository } from "./fakes.js";
import { reorderNotions } from "./reorder-notions.js";
import type { Notion } from "../domain/types.js";

const now = new Date("2026-01-01T00:00:00.000Z");

function aNotion(overrides: Partial<Notion> = {}): Notion {
  return {
    id: "n1",
    documentId: "doc-1",
    userId: "u1",
    title: "Notion",
    body: "Corps.",
    difficulty: "medium",
    position: 0,
    createdAt: now.toISOString(),
    ...overrides,
  };
}

describe("reorderNotions", () => {
  it("reverses a full list and persists the new contiguous positions", async () => {
    const repo = fakeNotionRepository([
      aNotion({ id: "a", position: 0 }),
      aNotion({ id: "b", position: 1 }),
      aNotion({ id: "c", position: 2 }),
    ]);

    const result = await reorderNotions({ repo }, "u1", "doc-1", ["c", "b", "a"]);

    expect(result).toEqual({ ok: true, value: undefined });
    const listed = await repo.listNotions("u1", "doc-1");
    expect(listed.map((n) => n.id)).toEqual(["c", "b", "a"]);
  });

  it("rejects a partial list and leaves positions untouched", async () => {
    const repo = fakeNotionRepository([aNotion({ id: "a", position: 0 }), aNotion({ id: "b", position: 1 })]);

    const result = await reorderNotions({ repo }, "u1", "doc-1", ["a"]);

    expect(result).toEqual({ ok: false, error: "partial-list" });
    const listed = await repo.listNotions("u1", "doc-1");
    expect(listed.map((n) => n.id)).toEqual(["a", "b"]);
  });
});
