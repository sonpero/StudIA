import { describe, expect, it } from "vitest";
import { fakeJobQueueForGeneration } from "./fakes.js";
import { getGenerationStatus } from "./get-generation-status.js";

const now = new Date("2026-01-01T00:00:00.000Z");

describe("getGenerationStatus", () => {
  it("derives done/total/failed from the most recent generate-cards job per notion", async () => {
    const jobQueue = fakeJobQueueForGeneration();
    await jobQueue.enqueue("u1", "generate-cards", { notionId: "n1", types: ["flashcard"], documentId: "doc-1" }, now);
    await jobQueue.enqueue("u1", "generate-cards", { notionId: "n2", types: ["flashcard"], documentId: "doc-1" }, now);
    jobQueue.rows[0]!.status = "done";
    jobQueue.rows[1]!.status = "failed";

    const status = await getGenerationStatus({ jobQueue }, "u1", "doc-1");

    expect(status).toEqual({ done: 1, total: 2, failed: 1 });
  });

  it("counts a notion with no job at all toward total, but not done or failed", async () => {
    const jobQueue = fakeJobQueueForGeneration();

    const status = await getGenerationStatus({ jobQueue }, "u1", "doc-1");

    expect(status).toEqual({ done: 0, total: 0, failed: 0 });
  });
});

describe("getGenerationStatus with a course-level job (M11)", () => {
  it("reports the course's latest generate-course-cards job as one unit of work", async () => {
    const jobQueue = fakeJobQueueForGeneration();
    await jobQueue.enqueue("u1", "generate-course-cards", { documentId: "doc-1" }, now);

    expect(await getGenerationStatus({ jobQueue }, "u1", "doc-1")).toEqual({ done: 0, total: 1, failed: 0 });

    jobQueue.rows[0]!.status = "done";
    expect(await getGenerationStatus({ jobQueue }, "u1", "doc-1")).toEqual({ done: 1, total: 1, failed: 0 });

    jobQueue.rows[0]!.status = "failed";
    expect(await getGenerationStatus({ jobQueue }, "u1", "doc-1")).toEqual({ done: 0, total: 1, failed: 1 });
  });

  it("ignores another course's job", async () => {
    const jobQueue = fakeJobQueueForGeneration();
    await jobQueue.enqueue("u1", "generate-course-cards", { documentId: "doc-2" }, now);

    expect(await getGenerationStatus({ jobQueue }, "u1", "doc-1")).toEqual({ done: 0, total: 0, failed: 0 });
  });
});
