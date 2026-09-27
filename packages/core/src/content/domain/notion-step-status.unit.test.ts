import { describe, expect, it } from "vitest";
import { latestNotionStepStatuses, notionStepStatusOf } from "./notion-step-status.js";

describe("notionStepStatusOf", () => {
  it("a pending job is still in progress (it may be waiting out a retry backoff)", () => {
    expect(notionStepStatusOf("pending")).toBe("pending");
  });

  it("a running job is in progress", () => {
    expect(notionStepStatusOf("running")).toBe("pending");
  });

  it("a done job means the notions are ready", () => {
    expect(notionStepStatusOf("done")).toBe("ready");
  });

  it("a failed job (retries exhausted) means the step failed", () => {
    expect(notionStepStatusOf("failed")).toBe("failed");
  });
});

describe("latestNotionStepStatuses", () => {
  it("keeps only the first (newest) job per document, input being newest first", () => {
    const statuses = latestNotionStepStatuses([
      { status: "pending", payload: { documentId: "doc-1" } },
      { status: "failed", payload: { documentId: "doc-1" } },
    ]);

    expect(statuses).toEqual([{ documentId: "doc-1", status: "pending" }]);
  });

  it("returns one entry per document", () => {
    const statuses = latestNotionStepStatuses([
      { status: "done", payload: { documentId: "doc-1" } },
      { status: "failed", payload: { documentId: "doc-2" } },
    ]);

    expect(statuses).toEqual([
      { documentId: "doc-1", status: "ready" },
      { documentId: "doc-2", status: "failed" },
    ]);
  });

  it("ignores a job whose payload carries no string documentId", () => {
    const statuses = latestNotionStepStatuses([
      { status: "failed", payload: { documentId: 42 } },
      { status: "failed", payload: null },
      { status: "done", payload: { documentId: "doc-1" } },
    ]);

    expect(statuses).toEqual([{ documentId: "doc-1", status: "ready" }]);
  });

  it("no job at all means no entry", () => {
    expect(latestNotionStepStatuses([])).toEqual([]);
  });
});
