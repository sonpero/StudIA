import { describe, expect, it } from "vitest";
import { fakeDocumentRepository, fakeJobQueueForIngestion } from "./fakes.js";
import { retryExtraction } from "./retry-extraction.js";
import type { Document } from "../domain/types.js";
import type { Job } from "../../jobs/index.js";

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

function aFailedJob(overrides: Partial<Job> = {}): Job {
  return {
    id: "job-old",
    userId: "u1",
    type: "extract-document",
    payload: { documentId: "doc-1" },
    status: "failed",
    attempts: 3,
    maxAttempts: 3,
    lastError: "boom",
    runAfter: now.toISOString(),
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    ...overrides,
  };
}

describe("retryExtraction", () => {
  it("re-enqueues a job when the document's latest extraction job has failed", async () => {
    const repo = fakeDocumentRepository([aDocument()]);
    const jobQueue = fakeJobQueueForIngestion([aFailedJob()]);

    const result = await retryExtraction({ repo, jobQueue }, "u1", "doc-1", now);

    expect(result.ok).toBe(true);
    expect(jobQueue.rows.filter((j) => j.status !== "failed")).toHaveLength(1);
  });

  it("rejects when no job has ever run for this document", async () => {
    const repo = fakeDocumentRepository([aDocument()]);
    const jobQueue = fakeJobQueueForIngestion([]);

    const result = await retryExtraction({ repo, jobQueue }, "u1", "doc-1", now);

    expect(result).toEqual({ ok: false, error: "not-failed" });
  });

  it("rejects when the latest job is still pending or running (only from failed)", async () => {
    const repo = fakeDocumentRepository([aDocument()]);
    const jobQueue = fakeJobQueueForIngestion([aFailedJob({ status: "running", lastError: null })]);

    const result = await retryExtraction({ repo, jobQueue }, "u1", "doc-1", now);

    expect(result).toEqual({ ok: false, error: "not-failed" });
  });

  it("rejects a document that does not belong to the caller", async () => {
    const repo = fakeDocumentRepository([aDocument({ userId: "someone-else" })]);
    const jobQueue = fakeJobQueueForIngestion([aFailedJob()]);

    const result = await retryExtraction({ repo, jobQueue }, "u1", "doc-1", now);

    expect(result).toEqual({ ok: false, error: "not-found" });
  });
});
