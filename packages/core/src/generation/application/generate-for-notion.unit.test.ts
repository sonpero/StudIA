import { describe, expect, it } from "vitest";
import { fakeJobQueueForGeneration } from "./fakes.js";
import { generateForNotion } from "./generate-for-notion.js";

const now = new Date("2026-01-01T00:00:00.000Z");

describe("generateForNotion", () => {
  it("enqueues a generate-cards job for the notion with the requested types", async () => {
    const jobQueue = fakeJobQueueForGeneration();

    const result = await generateForNotion({ jobQueue }, "u1", "n1", ["flashcard"], now);

    expect(result.jobId).toBeTruthy();
    expect(jobQueue.rows).toEqual([
      expect.objectContaining({ userId: "u1", type: "generate-cards", payload: { notionId: "n1", types: ["flashcard"] } }) as unknown,
    ]);
  });

  it("carries documentId in the payload when given, for the generation-status filter", async () => {
    const jobQueue = fakeJobQueueForGeneration();

    await generateForNotion({ jobQueue }, "u1", "n1", ["flashcard"], now, "doc-1");

    expect(jobQueue.rows).toEqual([
      expect.objectContaining({ payload: { notionId: "n1", types: ["flashcard"], documentId: "doc-1" } }) as unknown,
    ]);
  });
});
