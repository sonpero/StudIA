import { describe, expect, it } from "vitest";
import type { Document, DocumentRepository } from "../../ingestion/index.js";
import { fakeDocumentRepositoryForContent } from "./fakes.js";
import { aSplitJob, fakeJobQueueForContent } from "./fake-job-queue.js";
import { retryNotionSplit } from "./retry-notion-split.js";

const now = new Date("2026-01-03T00:00:00.000Z");

function aDocument(overrides: Partial<Document> = {}): Document {
  return {
    id: "doc-1",
    userId: "u1",
    title: "Cours",
    sourceType: "pdf",
    status: "done",
    pageCount: 1,
    colour: "#F87171",
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

// Content's shared fake only implements getExtraction; ownership is checked
// here through findDocument, scoped by userId like the real repository.
function documentRepoWith(documents: Document[]): DocumentRepository {
  return {
    ...fakeDocumentRepositoryForContent(null),
    findDocument: (userId, documentId) => Promise.resolve(documents.find((d) => d.id === documentId && d.userId === userId) ?? null),
  };
}

describe("retryNotionSplit", () => {
  it("enqueues a new split-notions job for the document when its latest split job has failed", async () => {
    const jobQueue = fakeJobQueueForContent([aSplitJob()]);

    const result = await retryNotionSplit({ documentRepo: documentRepoWith([aDocument()]), jobQueue }, "u1", "doc-1", now);

    expect(result.ok).toBe(true);
    const enqueued = jobQueue.rows.filter((row) => row.status === "pending");
    expect(enqueued).toHaveLength(1);
    expect(enqueued[0]).toMatchObject({ userId: "u1", type: "split-notions", payload: { documentId: "doc-1" } });
  });

  it("never touches extraction: no extract-document job is enqueued", async () => {
    const jobQueue = fakeJobQueueForContent([aSplitJob()]);

    await retryNotionSplit({ documentRepo: documentRepoWith([aDocument()]), jobQueue }, "u1", "doc-1", now);

    expect(jobQueue.rows.filter((row) => row.type === "extract-document")).toEqual([]);
  });

  it("rejects when the latest split job is still pending or running (only from failed)", async () => {
    const jobQueue = fakeJobQueueForContent([
      aSplitJob({ id: "old", status: "failed", createdAt: "2026-01-01T00:00:00.000Z" }),
      aSplitJob({ id: "new", status: "pending", createdAt: "2026-01-02T00:00:00.000Z" }),
    ]);

    const result = await retryNotionSplit({ documentRepo: documentRepoWith([aDocument()]), jobQueue }, "u1", "doc-1", now);

    expect(result).toEqual({ ok: false, error: "not-failed" });
    expect(jobQueue.rows).toHaveLength(2);
  });

  it("rejects when the latest split job is done", async () => {
    const jobQueue = fakeJobQueueForContent([aSplitJob({ status: "done" })]);

    const result = await retryNotionSplit({ documentRepo: documentRepoWith([aDocument()]), jobQueue }, "u1", "doc-1", now);

    expect(result).toEqual({ ok: false, error: "not-failed" });
  });

  it("rejects when no split job has ever run for this document", async () => {
    const jobQueue = fakeJobQueueForContent([aSplitJob({ payload: { documentId: "doc-2" } })]);

    const result = await retryNotionSplit({ documentRepo: documentRepoWith([aDocument()]), jobQueue }, "u1", "doc-1", now);

    expect(result).toEqual({ ok: false, error: "not-failed" });
  });

  it("rejects a document that does not belong to the caller, without enqueuing anything", async () => {
    const jobQueue = fakeJobQueueForContent([aSplitJob({ userId: "someone-else" })]);

    const result = await retryNotionSplit(
      { documentRepo: documentRepoWith([aDocument({ userId: "someone-else" })]), jobQueue },
      "u1",
      "doc-1",
      now,
    );

    expect(result).toEqual({ ok: false, error: "not-found" });
    expect(jobQueue.rows).toHaveLength(1);
  });
});
