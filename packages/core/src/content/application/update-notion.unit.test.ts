import { describe, expect, it, vi } from "vitest";
import { fakeNotionRepository } from "./fakes.js";
import { updateNotion } from "./update-notion.js";
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

describe("updateNotion", () => {
  it("updates the title, body and difficulty", async () => {
    const repo = fakeNotionRepository([aNotion()]);
    const markNotionStale = vi.fn().mockResolvedValue(undefined);

    const result = await updateNotion({ repo, markNotionStale }, "u1", "n1", { title: "Nouveau titre", difficulty: "hard" });

    expect(result).toEqual({ ok: true, value: expect.objectContaining({ title: "Nouveau titre", difficulty: "hard" }) as unknown });
  });

  it("rejects another user's notion", async () => {
    const repo = fakeNotionRepository([aNotion({ userId: "someone-else" })]);
    const markNotionStale = vi.fn().mockResolvedValue(undefined);

    const result = await updateNotion({ repo, markNotionStale }, "u1", "n1", { title: "Nouveau titre" });

    expect(result).toEqual({ ok: false, error: "not-found" });
  });

  it("rejects a title outside 3-80 characters", async () => {
    const repo = fakeNotionRepository([aNotion()]);
    const markNotionStale = vi.fn().mockResolvedValue(undefined);

    const result = await updateNotion({ repo, markNotionStale }, "u1", "n1", { title: "Hi" });

    expect(result).toEqual({ ok: false, error: "invalid-title" });
    expect((await repo.findNotion("u1", "n1"))?.title).toBe("Notion");
  });

  it("marks the notion's cards stale when the body changes (docs/modules/generation.md)", async () => {
    const repo = fakeNotionRepository([aNotion()]);
    const markNotionStale = vi.fn().mockResolvedValue(undefined);

    await updateNotion({ repo, markNotionStale }, "u1", "n1", { body: "Nouveau corps." });

    expect(markNotionStale).toHaveBeenCalledWith("u1", "n1");
  });

  it("does not mark cards stale when only the title or difficulty changes", async () => {
    const repo = fakeNotionRepository([aNotion()]);
    const markNotionStale = vi.fn().mockResolvedValue(undefined);

    await updateNotion({ repo, markNotionStale }, "u1", "n1", { title: "Nouveau titre", difficulty: "hard" });

    expect(markNotionStale).not.toHaveBeenCalled();
  });
});
