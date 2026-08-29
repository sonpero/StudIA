import { describe, expect, it } from "vitest";
import type { Notion } from "../../content/index.js";
import { fakeNotionRepositoryForProgress, fakeProgressRepository, fakeReviewRepositoryForProgress } from "./fakes.js";
import { getPlan } from "./get-plan.js";

const NOW = new Date("2026-03-02T09:00:00.000Z");

function aNotion(over: Partial<Notion> = {}): Notion {
  return { id: "n1", documentId: "doc1", userId: "u1", title: "Photosynthèse", body: "...", difficulty: "medium", position: 0, createdAt: "2026-01-01T00:00:00.000Z", ...over };
}

describe("getPlan", () => {
  it("assembles buildPlan's input from deadline, availability, notions and mastery, and returns its result", async () => {
    const notionRepo = fakeNotionRepositoryForProgress([aNotion()]);
    const reviewRepo = fakeReviewRepositoryForProgress([{ userId: "u1", documentId: "doc1", notionId: "n1", masteredCards: 0, totalCards: 1 }]);
    const repo = fakeProgressRepository({
      deadlines: [{ id: "d1", userId: "u1", documentId: "doc1", date: "2026-03-20", label: null, createdAt: "2026-01-01T00:00:00.000Z" }],
      availability: { u1: { mon: 30, tue: 30, wed: 30, thu: 30, fri: 30, sat: 0, sun: 0 } },
    });

    const result = await getPlan({ repo, notionRepo, reviewRepo }, "u1", "doc1", NOW);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const entries = result.value.days.flatMap((d) => d.entries);
    expect(entries.some((e) => e.notionId === "n1" && e.kind === "learn")).toBe(true);
  });

  it("excludes a notion whose cards are all mastered", async () => {
    const notionRepo = fakeNotionRepositoryForProgress([aNotion()]);
    const reviewRepo = fakeReviewRepositoryForProgress([{ userId: "u1", documentId: "doc1", notionId: "n1", masteredCards: 2, totalCards: 2 }]);
    const repo = fakeProgressRepository({
      deadlines: [{ id: "d1", userId: "u1", documentId: "doc1", date: "2026-03-20", label: null, createdAt: "2026-01-01T00:00:00.000Z" }],
      availability: { u1: { mon: 30, tue: 30, wed: 30, thu: 30, fri: 30, sat: 0, sun: 0 } },
    });

    const result = await getPlan({ repo, notionRepo, reviewRepo }, "u1", "doc1", NOW);
    expect(result).toEqual({ ok: true, value: { days: [], feasible: true, shortfallMinutes: 0 } });
  });

  it("returns Err(no-capacity) when the user has never set availability", async () => {
    const notionRepo = fakeNotionRepositoryForProgress([aNotion()]);
    const reviewRepo = fakeReviewRepositoryForProgress([{ userId: "u1", documentId: "doc1", notionId: "n1", masteredCards: 0, totalCards: 1 }]);
    const repo = fakeProgressRepository({
      deadlines: [{ id: "d1", userId: "u1", documentId: "doc1", date: "2026-03-20", label: null, createdAt: "2026-01-01T00:00:00.000Z" }],
    });

    const result = await getPlan({ repo, notionRepo, reviewRepo }, "u1", "doc1", NOW);
    expect(result).toEqual({ ok: false, error: { kind: "no-capacity" } });
  });

  it("passes deadline: null through to buildPlan when no deadline is set (a steady plan)", async () => {
    const notionRepo = fakeNotionRepositoryForProgress([aNotion()]);
    const reviewRepo = fakeReviewRepositoryForProgress([{ userId: "u1", documentId: "doc1", notionId: "n1", masteredCards: 0, totalCards: 1 }]);
    const repo = fakeProgressRepository({ availability: { u1: { mon: 30, tue: 30, wed: 30, thu: 30, fri: 30, sat: 30, sun: 30 } } });

    const result = await getPlan({ repo, notionRepo, reviewRepo }, "u1", "doc1", NOW);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.feasible).toBe(true);
  });
});
