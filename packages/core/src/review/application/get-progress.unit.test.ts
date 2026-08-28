import { describe, expect, it, vi } from "vitest";
import { fakeReviewRepository } from "./fakes.js";
import { getProgress } from "./get-progress.js";

const now = new Date("2026-01-05T00:00:00.000Z");

describe("getProgress", () => {
  it("returns the mastered/total counts and next due date from the repository", async () => {
    const repo = fakeReviewRepository();
    const getProgressMock = vi.fn().mockResolvedValue({ mastered: 3, total: 10, nextDueDate: "2026-01-08T00:00:00.000Z" });
    repo.getProgress = getProgressMock;

    expect(await getProgress({ repo }, "u1", "doc-1", now)).toEqual({ mastered: 3, total: 10, nextDueDate: "2026-01-08T00:00:00.000Z" });
    expect(getProgressMock).toHaveBeenCalledWith("u1", "doc-1", now);
  });
});
