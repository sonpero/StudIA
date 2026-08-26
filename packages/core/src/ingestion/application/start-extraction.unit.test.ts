import { describe, expect, it } from "vitest";
import { fakeDocumentRepository, fakeJobQueueForIngestion } from "./fakes.js";
import { startExtraction } from "./start-extraction.js";
import type { Document } from "../domain/types.js";

const now = new Date("2026-01-01T00:00:00.000Z");

function aDocument(overrides: Partial<Document> = {}): Document {
  return {
    id: "doc-1",
    userId: "u1",
    title: "Cours",
    sourceType: "photo",
    status: "pending",
    pageCount: 1,
    colour: "#F87171",
    createdAt: now.toISOString(),
    ...overrides,
  };
}

describe("startExtraction", () => {
  it("enqueues an extract-document job for the document", async () => {
    const repo = fakeDocumentRepository([aDocument()]);
    const jobQueue = fakeJobQueueForIngestion();

    const result = await startExtraction({ repo, jobQueue }, "u1", "doc-1", now);

    expect(result.ok).toBe(true);
    expect(jobQueue.rows).toEqual([
      expect.objectContaining({ userId: "u1", type: "extract-document", payload: { documentId: "doc-1" }, status: "pending" }),
    ]);
  });

  it("rejects a document that does not belong to the caller", async () => {
    const repo = fakeDocumentRepository([aDocument({ userId: "someone-else" })]);
    const jobQueue = fakeJobQueueForIngestion();

    const result = await startExtraction({ repo, jobQueue }, "u1", "doc-1", now);

    expect(result).toEqual({ ok: false, error: "not-found" });
    expect(jobQueue.rows).toHaveLength(0);
  });
});
