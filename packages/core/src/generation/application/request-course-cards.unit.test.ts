import { describe, expect, it } from "vitest";
import type { Notion } from "../../content/index.js";
import type { Card } from "../domain/types.js";
import { fakeJobQueueForGeneration, fakeKeyNotionRepository, fakeNotionRepositoryForCourse } from "./fakes.js";
import { requestCourseCards } from "./request-course-cards.js";

const now = new Date("2026-01-01T00:00:00.000Z");
const notion: Notion = { id: "n1", documentId: "doc-1", userId: "u1", title: "T", body: "B", difficulty: "medium", position: 0, createdAt: now.toISOString() };
const card: Card = { id: "c1", notionId: "n1", userId: "u1", type: "flashcard", state: "active", question: "Q ?", answer: "R", options: null, createdAt: now.toISOString() };

function deps(cards: Card[] = []) {
  return { jobQueue: fakeJobQueueForGeneration(), keyNotionRepo: fakeKeyNotionRepository([notion], { cards }), notionRepo: fakeNotionRepositoryForCourse([notion]) };
}

describe("requestCourseCards", () => {
  it("enqueues one generate-course-cards job for the course", async () => {
    const d = deps();
    const result = await requestCourseCards(d, "u1", "doc-1", now);

    expect(result.ok).toBe(true);
    expect(d.jobQueue.rows.map((j) => [j.type, j.userId, j.payload])).toEqual([["generate-course-cards", "u1", { documentId: "doc-1" }]]);
  });

  it("refuses a course with no notions, or someone else's", async () => {
    expect(await requestCourseCards(deps(), "u1", "doc-unknown", now)).toEqual({ ok: false, error: "not-found" });
    expect(await requestCourseCards(deps(), "u2", "doc-1", now)).toEqual({ ok: false, error: "not-found" });
  });

  it("refuses a course that already has cards: an existing course is never regenerated", async () => {
    const d = deps([card]);
    expect(await requestCourseCards(d, "u1", "doc-1", now)).toEqual({ ok: false, error: "has-cards" });
    expect(d.jobQueue.rows).toEqual([]);
  });

  it("refuses while a job for this course is pending or running, but not after one failed", async () => {
    const d = deps();
    await requestCourseCards(d, "u1", "doc-1", now);
    expect(await requestCourseCards(d, "u1", "doc-1", now)).toEqual({ ok: false, error: "in-progress" });

    d.jobQueue.rows[0]!.status = "running";
    expect(await requestCourseCards(d, "u1", "doc-1", now)).toEqual({ ok: false, error: "in-progress" });

    d.jobQueue.rows[0]!.status = "failed";
    expect((await requestCourseCards(d, "u1", "doc-1", now)).ok).toBe(true);
  });
});
