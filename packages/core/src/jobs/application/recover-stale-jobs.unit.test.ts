import { describe, expect, it } from "vitest";
import { fakeJobQueue } from "./fakes.js";
import { recoverStaleJobs } from "./recover-stale-jobs.js";
import type { Job } from "../domain/types.js";

const now = new Date("2026-01-01T00:00:00.000Z");

function job(overrides: Partial<Job>): Job {
  return {
    id: "job-0",
    userId: "u1",
    type: "extract-document",
    payload: {},
    status: "pending",
    attempts: 0,
    maxAttempts: 3,
    lastError: null,
    runAfter: now.toISOString(),
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    ...overrides,
  };
}

describe("recoverStaleJobs", () => {
  it("resets every running job back to pending and returns the count", async () => {
    const jobQueue = fakeJobQueue([job({ id: "a", status: "running" }), job({ id: "b", status: "pending" })]);

    const count = await recoverStaleJobs({ jobQueue }, now);

    expect(count).toBe(1);
    expect(jobQueue.rows.find((r) => r.id === "a")?.status).toBe("pending");
  });
});
