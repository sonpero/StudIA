import { describe, expect, it } from "vitest";
import type { Document } from "../../ingestion/index.js";
import type { Notion } from "../../content/index.js";
import { fakeDocumentRepositoryForPlanning, fakeNotionRepositoryForPlanning, fakePlanningRepository, fakeReviewRepositoryForPlanning } from "./fakes.js";
import { getToday } from "./get-today.js";

const NOW = new Date("2026-03-02T09:00:00.000Z");

function aDocument(over: Partial<Document> = {}): Document {
  return { id: "doc1", userId: "u1", title: "SVT", sourceType: "pdf", status: "done", pageCount: 3, colour: "#a78bfa", createdAt: "2026-01-01T00:00:00.000Z", ...over };
}

function aNotion(over: Partial<Notion> = {}): Notion {
  return { id: "n1", documentId: "doc1", userId: "u1", title: "Photosynthèse", body: "...", difficulty: "easy", position: 0, createdAt: "2026-01-01T00:00:00.000Z", ...over };
}

describe("getToday", () => {
  it("collects today's entries across every one of the user's documents", async () => {
    const documentRepo = fakeDocumentRepositoryForPlanning([aDocument({ id: "doc1" }), aDocument({ id: "doc2" })]);
    const notionRepo = fakeNotionRepositoryForPlanning([aNotion({ id: "n1", documentId: "doc1" }), aNotion({ id: "n2", documentId: "doc2" })]);
    const reviewRepo = fakeReviewRepositoryForPlanning([
      { userId: "u1", documentId: "doc1", notionId: "n1", masteredCards: 0, totalCards: 1 },
      { userId: "u1", documentId: "doc2", notionId: "n2", masteredCards: 0, totalCards: 1 },
    ]);
    const repo = fakePlanningRepository({ availability: { u1: { mon: 30, tue: 30, wed: 30, thu: 30, fri: 30, sat: 30, sun: 30 } } });

    const entries = await getToday({ repo, documentRepo, notionRepo, reviewRepo }, "u1", NOW);
    const notionIds = entries.map((e) => e.notionId);
    expect(notionIds).toContain("n1");
    expect(notionIds).toContain("n2");
    expect(entries.every((e) => e.documentId === "doc1" || e.documentId === "doc2")).toBe(true);
  });

  it("silently skips a document whose plan is a PlanningInputError (e.g. no availability set)", async () => {
    const documentRepo = fakeDocumentRepositoryForPlanning([aDocument({ id: "doc1" })]);
    const notionRepo = fakeNotionRepositoryForPlanning([aNotion({ id: "n1", documentId: "doc1" })]);
    const reviewRepo = fakeReviewRepositoryForPlanning([{ userId: "u1", documentId: "doc1", notionId: "n1", masteredCards: 0, totalCards: 1 }]);
    const repo = fakePlanningRepository(); // no availability set -> no-capacity for every document

    const entries = await getToday({ repo, documentRepo, notionRepo, reviewRepo }, "u1", NOW);
    expect(entries).toEqual([]);
  });

  it("only returns entries dated today, not the whole plan", async () => {
    const documentRepo = fakeDocumentRepositoryForPlanning([aDocument({ id: "doc1" })]);
    const notionRepo = fakeNotionRepositoryForPlanning(
      Array.from({ length: 5 }, (_, i) => aNotion({ id: `n${i}`, documentId: "doc1", position: i, difficulty: "hard" })),
    );
    const reviewRepo = fakeReviewRepositoryForPlanning(
      Array.from({ length: 5 }, (_, i) => ({ userId: "u1", documentId: "doc1", notionId: `n${i}`, masteredCards: 0, totalCards: 1 })),
    );
    // Tight capacity: only one hard notion (18min) fits today (20min/day),
    // so most of the 5 notions land on later days, not today.
    const repo = fakePlanningRepository({ availability: { u1: { mon: 20, tue: 20, wed: 20, thu: 20, fri: 20, sat: 20, sun: 20 } } });

    const entries = await getToday({ repo, documentRepo, notionRepo, reviewRepo }, "u1", NOW);
    expect(entries.length).toBeLessThan(5);
  });
});
