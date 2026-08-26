import { describe, expect, it } from "vitest";
import { fakeDocumentRepository, fakeJobQueueForIngestion } from "./fakes.js";
import { listDocuments } from "./list-documents.js";
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
    status: "done",
    attempts: 0,
    maxAttempts: 3,
    lastError: null,
    runAfter: now.toISOString(),
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    ...overrides,
  };
}

describe("listDocuments", () => {
  it("lists only the caller's documents, with live status from each one's latest job", async () => {
    const repo = fakeDocumentRepository([
      aDocument({ id: "doc-1" }),
      aDocument({ id: "doc-2", userId: "u2" }),
    ]);
    const jobQueue = fakeJobQueueForIngestion([aJob({ status: "done" })]);

    const docs = await listDocuments({ repo, jobQueue }, "u1");

    expect(docs).toHaveLength(1);
    expect(docs[0]).toMatchObject({ id: "doc-1", status: "done" });
  });

  it("returns an empty list for a user with no documents", async () => {
    const repo = fakeDocumentRepository([]);
    const jobQueue = fakeJobQueueForIngestion([]);

    expect(await listDocuments({ repo, jobQueue }, "u1")).toEqual([]);
  });
});
