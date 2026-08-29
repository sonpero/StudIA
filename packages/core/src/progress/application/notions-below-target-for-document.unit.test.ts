import { describe, expect, it } from "vitest";
import type { CardSchedule } from "../../review/index.js";
import type { Deadline } from "../domain/ports.js";
import { notionsBelowTargetForDocument } from "./notions-below-target-for-document.js";
import type { NotionCardRow } from "./assemble-progress-notions.js";

const NOW = new Date("2026-03-02T09:00:00.000Z");

function aNotion(id: string, createdAt = "2026-01-01T00:00:00.000Z") {
  return { id, documentId: "doc-1", userId: "u1", title: "Notion", body: "Corps.", difficulty: "medium" as const, position: 0, createdAt };
}

function aSchedule(overrides: Partial<CardSchedule> = {}): CardSchedule {
  return { cardId: "c1", userId: "u1", due: "2026-02-20T00:00:00.000Z", stability: 10, difficulty: 3, reps: 2, lapses: 0, lastReviewedAt: "2026-01-01T00:00:00.000Z", ...overrides };
}

function aDeadline(overrides: Partial<Deadline> = {}): Deadline {
  return { id: "d1", documentId: "doc-1", userId: "u1", date: "2026-03-20", label: null, createdAt: "2026-02-01T00:00:00.000Z", ...overrides };
}

describe("notionsBelowTargetForDocument", () => {
  it("does no I/O: a plain function over rows the caller already fetched", () => {
    // The type signature itself is the contract here — no repo/deps
    // parameter to inject a fake into, unlike every I/O-performing use
    // case in this module. This test exists so a future edit that adds
    // an async repository call is at least forced to change the
    // signature, not slip in unnoticed.
    const result = notionsBelowTargetForDocument([], [], null, NOW);
    expect(result).toEqual([]);
  });

  it("names the notions below target for this one document, same result computeProgress's status would call 'behind' for", () => {
    // deadline set 2026-02-20, due 2026-03-12: spanDays 20, elapsed 10 at
    // NOW (2026-03-02) => target = 0.9 * 10/20 = 0.45. n1/n2 never
    // reviewed (R = 0, below target); n3 reviewed with very high stability
    // just before NOW (R close to 1, above target). Average readiness
    // (0 + 0 + ~1) / 3 ≈ 0.33, comfortably below the 0.45 target, so the
    // course-level status is genuinely 'behind' — not just individual
    // notions below target with the aggregate reading 'on-track', which
    // notionsBelowTargetForDocument must report as empty regardless (see
    // the domain-level notionsBelowTarget's own gating).
    const notions = [aNotion("n1"), aNotion("n2"), aNotion("n3")];
    const cardRows: NotionCardRow[] = [
      { notionId: "n1", cardId: "c1", schedule: null },
      { notionId: "n2", cardId: "c2", schedule: null },
      { notionId: "n3", cardId: "c3", schedule: aSchedule({ cardId: "c3", stability: 1000, lastReviewedAt: NOW.toISOString() }) },
    ];

    const result = notionsBelowTargetForDocument(notions, cardRows, aDeadline({ date: "2026-03-12", createdAt: "2026-02-20T00:00:00.000Z" }), NOW);

    expect(result).toEqual(["n1", "n2"]);
  });

  it("is empty with no deadline, regardless of any notion's schedule", () => {
    const notions = [aNotion("n1")];
    const cardRows: NotionCardRow[] = [{ notionId: "n1", cardId: "c1", schedule: null }];

    expect(notionsBelowTargetForDocument(notions, cardRows, null, NOW)).toEqual([]);
  });

  it("is empty for a lapsed deadline: feeds 'what to work on', not a status display, so a stale deadline just contributes nothing", () => {
    const notions = [aNotion("n1")];
    const cardRows: NotionCardRow[] = [{ notionId: "n1", cardId: "c1", schedule: null }];

    expect(notionsBelowTargetForDocument(notions, cardRows, aDeadline({ date: "2026-01-01", createdAt: "2025-12-01T00:00:00.000Z" }), NOW)).toEqual([]);
  });

  it("is empty for a document with no notions at all", () => {
    expect(notionsBelowTargetForDocument([], [], aDeadline(), NOW)).toEqual([]);
  });
});
