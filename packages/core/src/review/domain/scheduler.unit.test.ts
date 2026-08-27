import { describe, expect, it } from "vitest";
import { schedule } from "./scheduler.js";
import type { CardSchedule } from "./types.js";

const now = new Date("2026-01-01T00:00:00.000Z");

describe("schedule", () => {
  // Exact values captured empirically from ts-fsrs (default parameters,
  // enable_short_term/enable_fuzz disabled — docs/TESTING.md: no tolerance
  // windows, assert exact dates), not guessed.
  it("again (1) from a fresh card: due the next day, short stability", () => {
    const result = schedule(null, 1, now);
    expect(result).toMatchObject({ due: "2026-01-02T00:00:00.000Z", reps: 1, lapses: 0 });
    expect(result.stability).toBeCloseTo(0.212, 3);
  });

  it("hard (2) from a fresh card", () => {
    const result = schedule(null, 2, now);
    expect(result).toMatchObject({ due: "2026-01-03T00:00:00.000Z", reps: 1, lapses: 0 });
    expect(result.stability).toBeCloseTo(1.2931, 3);
  });

  it("good (3) from a fresh card", () => {
    const result = schedule(null, 3, now);
    expect(result).toMatchObject({ due: "2026-01-04T00:00:00.000Z", reps: 1, lapses: 0 });
    expect(result.stability).toBeCloseTo(2.3065, 3);
  });

  it("easy (4) from a fresh card: due furthest out, highest stability", () => {
    const result = schedule(null, 4, now);
    expect(result).toMatchObject({ due: "2026-01-09T00:00:00.000Z", reps: 1, lapses: 0 });
    expect(result.stability).toBeCloseTo(8.2956, 3);
  });

  it("sets lastReviewedAt to now and scopes cardId/userId from the current schedule", () => {
    const current: CardSchedule = {
      cardId: "c1",
      userId: "u1",
      due: now.toISOString(),
      stability: 0,
      difficulty: 0,
      reps: 0,
      lapses: 0,
      lastReviewedAt: null,
    };
    const result = schedule(current, 3, now);
    expect(result.cardId).toBe("c1");
    expect(result.userId).toBe("u1");
    expect(result.lastReviewedAt).toBe(now.toISOString());
  });

  it("is deterministic: the same card, rating and now always yields the same schedule", () => {
    const current: CardSchedule = {
      cardId: "c1",
      userId: "u1",
      due: now.toISOString(),
      stability: 2.3065,
      difficulty: 2.1181,
      reps: 1,
      lapses: 0,
      lastReviewedAt: now.toISOString(),
    };
    const later = new Date("2026-01-05T00:00:00.000Z");

    const first = schedule(current, 3, later);
    const second = schedule(current, 3, later);

    expect(first).toEqual(second);
  });

  it("a lapse (again, on an established card) increments lapses and shortens stability", () => {
    const established: CardSchedule = {
      cardId: "c1",
      userId: "u1",
      due: "2026-01-10T00:00:00.000Z",
      stability: 7.3153,
      difficulty: 2.1112,
      reps: 2,
      lapses: 0,
      lastReviewedAt: "2026-01-05T00:00:00.000Z",
    };
    const reviewedAt = new Date("2026-01-10T00:00:00.000Z");

    const result = schedule(established, 1, reviewedAt);

    expect(result.lapses).toBe(1);
    expect(result.reps).toBe(3);
    expect(result.stability).toBeLessThan(established.stability);
  });

  it("continuing to review an established card advances reps and pushes the due date further out", () => {
    const established: CardSchedule = {
      cardId: "c1",
      userId: "u1",
      due: "2026-01-05T00:00:00.000Z",
      stability: 2.3065,
      difficulty: 2.1181,
      reps: 1,
      lapses: 0,
      lastReviewedAt: "2026-01-01T00:00:00.000Z",
    };
    const reviewedAt = new Date("2026-01-05T00:00:00.000Z");

    const result = schedule(established, 3, reviewedAt);

    expect(result).toMatchObject({ due: "2026-01-21T00:00:00.000Z", reps: 2, lapses: 0 });
    expect(result.stability).toBeCloseTo(16.1773, 3);
  });
});
