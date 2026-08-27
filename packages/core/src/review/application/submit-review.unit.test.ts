import { describe, expect, it } from "vitest";
import { fakeReviewRepository } from "./fakes.js";
import { uuidV7Generator } from "../../shared/index.js";
import { submitReview } from "./submit-review.js";
import type { CardSchedule } from "../domain/types.js";

const now = new Date("2026-01-01T00:00:00.000Z");

describe("submitReview", () => {
  it("schedules a brand-new card (no prior schedule) and writes both rows", async () => {
    const repo = fakeReviewRepository();

    const result = await submitReview({ repo, idGenerator: uuidV7Generator }, "u1", "c1", 3, 4200, now);

    expect(result).toMatchObject({ cardId: "c1", userId: "u1", due: "2026-01-04T00:00:00.000Z", reps: 1 });
    expect(repo.reviews).toEqual([
      expect.objectContaining({ cardId: "c1", userId: "u1", rating: 3, elapsedMs: 4200, reviewedAt: now.toISOString() }) as unknown,
    ]);
    expect(await repo.findSchedule("u1", "c1")).toEqual(result);
  });

  it("recomputes from the existing schedule when one exists", async () => {
    const existing: CardSchedule = {
      cardId: "c1",
      userId: "u1",
      due: "2026-01-04T00:00:00.000Z",
      stability: 2.3065,
      difficulty: 2.1181,
      reps: 1,
      lapses: 0,
      lastReviewedAt: "2026-01-01T00:00:00.000Z",
    };
    const repo = fakeReviewRepository({ schedules: [existing] });
    const reviewedAt = new Date("2026-01-05T00:00:00.000Z");

    const result = await submitReview({ repo, idGenerator: uuidV7Generator }, "u1", "c1", 3, 1000, reviewedAt);

    expect(result.reps).toBe(2);
    expect(result.stability).toBeGreaterThan(existing.stability);
  });

  it("does not let one user's review touch another user's schedule for the same card id", async () => {
    const otherUsersSchedule: CardSchedule = {
      cardId: "c1",
      userId: "u2",
      due: "2026-01-04T00:00:00.000Z",
      stability: 2.3065,
      difficulty: 2.1181,
      reps: 1,
      lapses: 0,
      lastReviewedAt: "2026-01-01T00:00:00.000Z",
    };
    const repo = fakeReviewRepository({ schedules: [otherUsersSchedule] });

    await submitReview({ repo, idGenerator: uuidV7Generator }, "u1", "c1", 3, 1000, now);

    // u1's schedule started fresh (reps 1), u2's is untouched.
    expect(await repo.findSchedule("u1", "c1")).toMatchObject({ reps: 1 });
    expect(await repo.findSchedule("u2", "c1")).toMatchObject({ reps: 1, stability: 2.3065 });
  });
});
