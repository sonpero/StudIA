import { describe, expect, it, vi } from "vitest";
import { fakeReviewRepository } from "./fakes.js";
import { getProgress } from "./get-progress.js";

describe("getProgress", () => {
  it("returns the mastered/total counts from the repository", async () => {
    const repo = fakeReviewRepository();
    repo.getProgress = vi.fn().mockResolvedValue({ mastered: 3, total: 10 });

    expect(await getProgress({ repo }, "u1", "doc-1")).toEqual({ mastered: 3, total: 10 });
  });
});
