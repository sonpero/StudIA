import { describe, expect, it } from "vitest";
import { fakeReviewRepository } from "./fakes.js";
import { abandonSession } from "./abandon-session.js";
import type { Review } from "../domain/types.js";

const now = new Date("2026-01-01T00:00:00.000Z");

describe("abandonSession", () => {
  it("ends the session, without touching any already-answered reviews", async () => {
    const answeredReview: Review = { id: "r1", cardId: "c1", userId: "u1", rating: 3, reviewedAt: now.toISOString(), elapsedMs: 1000 };
    const repo = fakeReviewRepository({
      sessions: [{ id: "s1", userId: "u1", documentId: "doc-1", startedAt: now.toISOString(), endedAt: null }],
      reviews: [answeredReview],
    });

    const result = await abandonSession({ repo }, "u1", "s1", now);

    expect(result).toEqual({ ok: true, value: undefined });
    expect(repo.sessions[0]?.endedAt).toBe(now.toISOString());
    expect(repo.reviews).toEqual([answeredReview]);
  });

  it("rejects another user's session", async () => {
    const repo = fakeReviewRepository({
      sessions: [{ id: "s1", userId: "someone-else", documentId: null, startedAt: now.toISOString(), endedAt: null }],
    });

    expect(await abandonSession({ repo }, "u1", "s1", now)).toEqual({ ok: false, error: "not-found" });
  });
});
