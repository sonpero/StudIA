import { describe, expect, it } from "vitest";
import { fakeJobQueue } from "./fakes.js";
import { enqueueJob } from "./enqueue-job.js";

const now = new Date("2026-01-01T00:00:00.000Z");

describe("enqueueJob", () => {
  it("writes a pending row and returns its id", async () => {
    const jobQueue = fakeJobQueue([]);

    const id = await enqueueJob({ jobQueue }, "u1", "extract-document", { documentId: "d1" }, now);

    expect(jobQueue.rows).toEqual([
      expect.objectContaining({ id, userId: "u1", type: "extract-document", payload: { documentId: "d1" }, status: "pending" }),
    ]);
  });
});
