import { describe, expect, it } from "vitest";
import { fakeNotionRepository } from "./fakes.js";
import { listNotions } from "./list-notions.js";
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

describe("listNotions", () => {
  it("lists only the caller's notions for that document, ordered by position", async () => {
    const repo = fakeNotionRepository([
      aNotion({ id: "n2", position: 1 }),
      aNotion({ id: "n1", position: 0 }),
      aNotion({ id: "n3", userId: "u2" }),
    ]);

    const notions = await listNotions({ repo }, "u1", "doc-1");

    expect(notions.map((n) => n.id)).toEqual(["n1", "n2"]);
  });
});
