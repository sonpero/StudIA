import { describe, expect, it } from "vitest";
import { fakeDocumentRepository, fakeJobQueueForIngestion } from "./fakes.js";
import { scheduleAbandonedDocumentCleanup } from "./schedule-abandoned-document-cleanup.js";
import type { Document } from "../domain/types.js";

const now = new Date("2026-01-01T00:00:00.000Z");

function aDocument(overrides: Partial<Document> = {}): Document {
  return {
    id: "doc-1",
    userId: "u1",
    title: "Cours",
    sourceType: "photo",
    status: "pending",
    pageCount: 0,
    colour: "#F87171",
    createdAt: now.toISOString(),
    ...overrides,
  };
}

describe("scheduleAbandonedDocumentCleanup", () => {
  it("enqueues one cleanup-abandoned-documents job per distinct document owner", async () => {
    const repo = fakeDocumentRepository([
      aDocument({ id: "d1", userId: "u1" }),
      aDocument({ id: "d2", userId: "u1" }),
      aDocument({ id: "d3", userId: "u2" }),
    ]);
    const jobQueue = fakeJobQueueForIngestion();

    await scheduleAbandonedDocumentCleanup({ repo, jobQueue }, now);

    const enqueued = jobQueue.rows.filter((row) => row.type === "cleanup-abandoned-documents");
    expect(enqueued.map((row) => row.userId).sort()).toEqual(["u1", "u2"]);
  });

  it("enqueues nothing when no user owns any document", async () => {
    const repo = fakeDocumentRepository([]);
    const jobQueue = fakeJobQueueForIngestion();

    await scheduleAbandonedDocumentCleanup({ repo, jobQueue }, now);

    expect(jobQueue.rows).toHaveLength(0);
  });
});
