import { describe, expect, it } from "vitest";
import { fakeDocumentRepository, fakeJobQueueForIngestion } from "./fakes.js";
import { getDocument } from "./get-document.js";
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

function aJob(overrides: Partial<Job> = {}): Job {
  return {
    id: "job-1",
    userId: "u1",
    type: "extract-document",
    payload: { documentId: "doc-1" },
    status: "running",
    attempts: 0,
    maxAttempts: 3,
    lastError: null,
    runAfter: now.toISOString(),
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    ...overrides,
  };
}

describe("getDocument", () => {
  it("returns the document with the live status and lastError from its latest extraction job", async () => {
    const repo = fakeDocumentRepository([aDocument({ status: "pending" })]);
    const jobQueue = fakeJobQueueForIngestion([aJob({ status: "failed", lastError: "La photo est trop floue." })]);

    const result = await getDocument({ repo, jobQueue }, "u1", "doc-1");

    expect(result).toEqual({
      ok: true,
      value: expect.objectContaining({ id: "doc-1", status: "failed", lastError: "La photo est trop floue." }) as unknown,
    });
  });

  it("falls back to the document's own stored status when extraction was never started", async () => {
    const repo = fakeDocumentRepository([aDocument({ status: "pending" })]);
    const jobQueue = fakeJobQueueForIngestion([]);

    const result = await getDocument({ repo, jobQueue }, "u1", "doc-1");

    expect(result).toEqual({ ok: true, value: expect.objectContaining({ status: "pending", lastError: null, markdown: null }) as unknown });
  });

  it("includes the extracted markdown once extraction has produced one", async () => {
    const repo = fakeDocumentRepository([aDocument({ status: "done" })]);
    await repo.upsertExtraction("u1", "doc-1", "# Titre\n\nContenu.", now);
    const jobQueue = fakeJobQueueForIngestion([aJob({ status: "done", lastError: null })]);

    const result = await getDocument({ repo, jobQueue }, "u1", "doc-1");

    expect(result).toEqual({ ok: true, value: expect.objectContaining({ markdown: "# Titre\n\nContenu." }) as unknown });
  });

  it("returns not-found for another user's document", async () => {
    const repo = fakeDocumentRepository([aDocument({ userId: "someone-else" })]);
    const jobQueue = fakeJobQueueForIngestion([]);

    const result = await getDocument({ repo, jobQueue }, "u1", "doc-1");

    expect(result).toEqual({ ok: false, error: "not-found" });
  });
});
