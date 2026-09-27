import { describe, expect, it } from "vitest";
import { aSplitJob, fakeJobQueueForContent } from "./fake-job-queue.js";
import { listNotionStatuses } from "./list-notion-statuses.js";

describe("listNotionStatuses", () => {
  it("derives each document's notion-step status from its latest split-notions job", async () => {
    const jobQueue = fakeJobQueueForContent([
      aSplitJob({ id: "old", status: "failed", createdAt: "2026-01-01T00:00:00.000Z" }),
      aSplitJob({ id: "new", status: "running", createdAt: "2026-01-02T00:00:00.000Z" }),
      aSplitJob({ id: "other", status: "done", payload: { documentId: "doc-2" } }),
    ]);

    const statuses = await listNotionStatuses({ jobQueue }, "u1");

    expect(statuses).toEqual([
      { documentId: "doc-1", status: "pending" },
      { documentId: "doc-2", status: "ready" },
    ]);
  });

  it("only reads split-notions jobs, not another job type for the same document", async () => {
    const jobQueue = fakeJobQueueForContent([aSplitJob({ type: "extract-document", status: "failed" })]);

    expect(await listNotionStatuses({ jobQueue }, "u1")).toEqual([]);
  });

  it("is scoped to the caller: another user's failed split is absent", async () => {
    const jobQueue = fakeJobQueueForContent([aSplitJob({ userId: "someone-else" })]);

    expect(await listNotionStatuses({ jobQueue }, "u1")).toEqual([]);
  });

  it("never exposes the job's error text", async () => {
    const jobQueue = fakeJobQueueForContent([aSplitJob()]);

    const statuses = await listNotionStatuses({ jobQueue }, "u1");

    expect(statuses).toEqual([{ documentId: "doc-1", status: "failed" }]);
    expect(JSON.stringify(statuses)).not.toContain("expected 5 to 60");
  });
});
