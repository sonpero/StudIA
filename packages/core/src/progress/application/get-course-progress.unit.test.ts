import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { CardSchedule } from "../../review/index.js";
import { readinessProjectionDate } from "../domain/compute-progress.js";
import { fakeNotionRepositoryForProgress, fakeProgressRepository, fakeReviewRepositoryForProgress } from "./fakes.js";
import { getCourseProgress } from "./get-course-progress.js";

const NOW = new Date("2026-03-02T09:00:00.000Z");

function aNotion(id: string, createdAt = "2026-01-01T00:00:00.000Z") {
  return { id, documentId: "doc-1", userId: "u1", title: "Notion", body: "Corps.", difficulty: "medium" as const, position: 0, createdAt };
}

function aSchedule(overrides: Partial<CardSchedule> = {}): CardSchedule {
  return { cardId: "c1", userId: "u1", due: "2026-02-20T00:00:00.000Z", stability: 10, difficulty: 3, reps: 2, lapses: 0, lastReviewedAt: "2026-01-01T00:00:00.000Z", ...overrides };
}

describe("getCourseProgress", () => {
  it("assembles notions+schedules, computes progress, and carries the deadline's date/label alongside it", async () => {
    const notionRepo = fakeNotionRepositoryForProgress([aNotion("n1")]);
    const reviewRepo = fakeReviewRepositoryForProgress([{ userId: "u1", documentId: "doc-1", notionId: "n1", cardId: "c1", schedule: aSchedule() }]);
    const repo = fakeProgressRepository({
      deadlines: [{ id: "d1", documentId: "doc-1", userId: "u1", date: "2026-03-20", label: "Contrôle", createdAt: "2026-02-01T00:00:00.000Z" }],
    });

    const result = await getCourseProgress({ repo, notionRepo, reviewRepo }, "u1", "doc-1", NOW);

    expect(result.deadlineDate).toBe("2026-03-20");
    expect(result.deadlineLabel).toBe("Contrôle");
    expect(result.progress.coverage).toBe(1);
  });

  it("no deadline set: deadlineDate/deadlineLabel are null, status is 'no-deadline'", async () => {
    const notionRepo = fakeNotionRepositoryForProgress([aNotion("n1")]);
    const reviewRepo = fakeReviewRepositoryForProgress([]);
    const repo = fakeProgressRepository();

    const result = await getCourseProgress({ repo, notionRepo, reviewRepo }, "u1", "doc-1", NOW);

    expect(result.deadlineDate).toBeNull();
    expect(result.deadlineLabel).toBeNull();
    expect(result.progress.status).toBe("no-deadline");
  });

  it("deadline in the past: still carries that same deadline's date/label, from the one fetch, not a second read — progress.status is 'deadline-in-past', not an Err", async () => {
    const notionRepo = fakeNotionRepositoryForProgress([aNotion("n1")]);
    const reviewRepo = fakeReviewRepositoryForProgress([]);
    const repo = fakeProgressRepository({
      deadlines: [{ id: "d1", documentId: "doc-1", userId: "u1", date: "2026-01-01", label: "Ancien contrôle", createdAt: "2025-12-01T00:00:00.000Z" }],
    });

    const result = await getCourseProgress({ repo, notionRepo, reviewRepo }, "u1", "doc-1", NOW);

    expect(result.deadlineDate).toBe("2026-01-01");
    expect(result.deadlineLabel).toBe("Ancien contrôle");
    expect(result.progress.status).toBe("deadline-in-past");
  });

  it("scopes notions and schedules to the requested document, ignoring another document's data", async () => {
    const notionRepo = fakeNotionRepositoryForProgress([aNotion("n1"), { ...aNotion("n-other"), documentId: "doc-2" }]);
    const reviewRepo = fakeReviewRepositoryForProgress([
      { userId: "u1", documentId: "doc-1", notionId: "n1", cardId: "c1", schedule: null },
      { userId: "u1", documentId: "doc-2", notionId: "n-other", cardId: "c-other", schedule: aSchedule({ cardId: "c-other" }) },
    ]);
    const repo = fakeProgressRepository();

    const result = await getCourseProgress({ repo, notionRepo, reviewRepo }, "u1", "doc-1", NOW);

    // Only n1 (unreviewed) belongs to doc-1; doc-2's reviewed notion must
    // not leak in and inflate coverage.
    expect(result.progress.coverage).toBe(0);
  });
});

// Property 4b — the half of the original property 4 that could not live in
// computeProgress (docs/modules/progress.md): the actual decay requires
// retrievability to be recomputed against a sliding now+14d window, which
// only happens here, at the getCourseProgress pipeline level.
describe("getCourseProgress — 4b: no deadline, no activity, readiness never increases as now advances", () => {
  const BASE = new Date("2026-01-01T00:00:00.000Z");

  // A concrete, large offset: not conditioned on the property's random
  // day-boundary check, so this fails outright (not just skips its
  // assertion) if the projection date is ever hardcoded or otherwise
  // stops tracking `now` — a mutation that the property below, phrased as
  // "strict only if the two dates differ," could silently stop exercising
  // if both random offsets happened to collapse to the same date.
  it("concretely decreases readiness between a near and a far now, no deadline, no activity", async () => {
    const schedule = aSchedule({ cardId: "c1", lastReviewedAt: BASE.toISOString() });
    const notionRepo = fakeNotionRepositoryForProgress([aNotion("n1")]);
    const reviewRepo = fakeReviewRepositoryForProgress([{ userId: "u1", documentId: "doc-1", notionId: "n1", cardId: "c1", schedule }]);
    const repo = fakeProgressRepository();

    const near = await getCourseProgress({ repo, notionRepo, reviewRepo }, "u1", "doc-1", BASE);
    const far = new Date(BASE);
    far.setUTCDate(far.getUTCDate() + 30);
    const later = await getCourseProgress({ repo, notionRepo, reviewRepo }, "u1", "doc-1", far);

    expect(later.progress.readiness).toBeLessThan(near.progress.readiness);
  });

  it("weak form always; strict form once at least one card has been reviewed and a day boundary is crossed", async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 0, max: 60 }), fc.integer({ min: 0, max: 60 }), async (offsetA, offsetB) => {
        const [oEarly, oLate] = offsetA <= offsetB ? [offsetA, offsetB] : [offsetB, offsetA];
        const now1 = new Date(BASE);
        now1.setUTCDate(now1.getUTCDate() + oEarly);
        const now2 = new Date(BASE);
        now2.setUTCDate(now2.getUTCDate() + oLate);

        const schedule = aSchedule({ cardId: "c1", lastReviewedAt: BASE.toISOString() });
        const notionRepo = fakeNotionRepositoryForProgress([aNotion("n1")]);
        const reviewRepo = fakeReviewRepositoryForProgress([{ userId: "u1", documentId: "doc-1", notionId: "n1", cardId: "c1", schedule }]);
        const repo = fakeProgressRepository();

        const r1 = await getCourseProgress({ repo, notionRepo, reviewRepo }, "u1", "doc-1", now1);
        const r2 = await getCourseProgress({ repo, notionRepo, reviewRepo }, "u1", "doc-1", now2);

        expect(r2.progress.readiness).toBeLessThanOrEqual(r1.progress.readiness);

        const day1 = readinessProjectionDate(null, now1).toISOString().slice(0, 10);
        const day2 = readinessProjectionDate(null, now2).toISOString().slice(0, 10);
        if (day1 !== day2) {
          expect(r2.progress.readiness).toBeLessThan(r1.progress.readiness);
        }
      }),
    );
  });
});
