import { describe, expect, it, vi } from "vitest";
import { fakeReviewRepository } from "./fakes.js";
import { getNotionsProgress } from "./get-notions-progress.js";

describe("getNotionsProgress", () => {
  it("returns the per-notion mastered/total card counts from the repository", async () => {
    const repo = fakeReviewRepository();
    repo.getNotionsProgress = vi.fn().mockResolvedValue([
      { notionId: "n1", masteredCards: 2, totalCards: 3 },
      { notionId: "n2", masteredCards: 0, totalCards: 0 },
    ]);

    expect(await getNotionsProgress({ repo }, "u1", "doc-1")).toEqual([
      { notionId: "n1", masteredCards: 2, totalCards: 3 },
      { notionId: "n2", masteredCards: 0, totalCards: 0 },
    ]);
  });
});
