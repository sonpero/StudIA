import { describe, expect, it } from "vitest";
import { projectRetrievability, type CardSchedule } from "../../review/index.js";
import { assembleProgressNotions } from "./assemble-progress-notions.js";

const NOW = new Date("2026-03-02T09:00:00.000Z");

function aNotion(id: string, createdAt = "2026-01-01T00:00:00.000Z") {
  return { id, documentId: "doc-1", userId: "u1", title: "Notion", body: "Corps.", difficulty: "medium" as const, position: 0, createdAt };
}

function aSchedule(overrides: Partial<CardSchedule> = {}): CardSchedule {
  return { cardId: "c1", userId: "u1", due: "2026-02-20T00:00:00.000Z", stability: 5, difficulty: 3, reps: 2, lapses: 0, lastReviewedAt: "2026-02-15T00:00:00.000Z", ...overrides };
}

describe("assembleProgressNotions", () => {
  it("groups card rows by notion, never-reviewed cards get retrievability 0, reviewed cards get review.projectRetrievability's own value at the given date", () => {
    const schedule = aSchedule({ cardId: "reviewed" });
    const notions = [aNotion("n1"), aNotion("n2")];
    const cardRows = [
      { notionId: "n1", cardId: "reviewed", schedule },
      { notionId: "n1", cardId: "never-reviewed", schedule: null },
    ];

    const result = assembleProgressNotions(notions, cardRows, NOW);

    expect(result).toEqual([
      {
        id: "n1",
        createdAt: "2026-01-01T00:00:00.000Z",
        cards: [
          { reviewed: true, retrievability: projectRetrievability(schedule, NOW) },
          { reviewed: false, retrievability: 0 },
        ],
      },
      { id: "n2", createdAt: "2026-01-01T00:00:00.000Z", cards: [] },
    ]);
  });

  it("a notion with no card rows at all gets cards: []", () => {
    const result = assembleProgressNotions([aNotion("n1")], [], NOW);
    expect(result).toEqual([{ id: "n1", createdAt: "2026-01-01T00:00:00.000Z", cards: [] }]);
  });

  it("reviewed cards' retrievability actually varies with the projection date (proves the date argument is wired through, not ignored)", () => {
    const schedule = aSchedule({ cardId: "c1" });
    const soon = assembleProgressNotions([aNotion("n1")], [{ notionId: "n1", cardId: "c1", schedule }], new Date("2026-02-16T00:00:00.000Z"));
    const later = assembleProgressNotions([aNotion("n1")], [{ notionId: "n1", cardId: "c1", schedule }], new Date("2026-06-01T00:00:00.000Z"));

    expect(later[0]!.cards[0]!.retrievability).toBeLessThan(soon[0]!.cards[0]!.retrievability);
  });
});
