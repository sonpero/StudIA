import { describe, expect, it } from "vitest";
import { fakeNotionRepository } from "./fakes.js";
import { deleteNotion } from "./delete-notion.js";
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

describe("deleteNotion", () => {
  it("deletes the notion and renumbers the survivors contiguously from 0", async () => {
    const repo = fakeNotionRepository([
      aNotion({ id: "a", position: 0 }),
      aNotion({ id: "b", position: 1 }),
      aNotion({ id: "c", position: 2 }),
    ]);

    const result = await deleteNotion({ repo }, "u1", "b");

    expect(result).toEqual({ ok: true, value: undefined });
    const listed = await repo.listNotions("u1", "doc-1");
    expect(listed.map((n) => [n.id, n.position])).toEqual([
      ["a", 0],
      ["c", 1],
    ]);
  });

  it("rejects another user's notion, without touching anything", async () => {
    const repo = fakeNotionRepository([aNotion({ userId: "someone-else" })]);

    const result = await deleteNotion({ repo }, "u1", "n1");

    expect(result).toEqual({ ok: false, error: "not-found" });
    expect(repo.notions).toHaveLength(1);
  });
});
