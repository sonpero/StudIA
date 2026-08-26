import { z } from "zod";
import { describe, expect, it, vi } from "vitest";
import { err, ok } from "../../shared/index.js";
import type { JobHandler } from "../domain/ports.js";
import type { Job } from "../domain/types.js";
import { fakeJobQueue } from "./fakes.js";
import { runWorkerTick } from "./run-worker-tick.js";

const now = new Date("2026-01-01T00:00:00.000Z");

function seededJob(overrides: Partial<Job> = {}): Job {
  return {
    id: "job-0",
    userId: "u1",
    type: "extract-document",
    payload: { documentId: "d1" },
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

const payloadSchema = z.object({ documentId: z.string() });

describe("runWorkerTick", () => {
  it("returns 'empty' and does nothing when there is no eligible job", async () => {
    const jobQueue = fakeJobQueue([]);

    const outcome = await runWorkerTick({ jobQueue, handlers: new Map() }, now);

    expect(outcome).toBe("empty");
  });

  it("claims a job, dispatches to the matching handler, and completes it on success", async () => {
    const jobQueue = fakeJobQueue([seededJob()]);
    const handle = vi.fn().mockResolvedValue(ok(undefined));
    const handler: JobHandler<{ documentId: string }> = { type: "extract-document", payloadSchema, handle };

    const outcome = await runWorkerTick({ jobQueue, handlers: new Map([["extract-document", handler]]) }, now);

    expect(outcome).toBe("claimed");
    expect(handle).toHaveBeenCalledWith({ documentId: "d1" }, { jobId: "job-0", userId: "u1", attempt: 1, now });
    expect(jobQueue.rows[0]?.status).toBe("done");
  });

  it("records a non-terminal failure (retry-eligible) when the handler returns an error", async () => {
    const jobQueue = fakeJobQueue([seededJob()]);
    const handler: JobHandler<{ documentId: string }> = {
      type: "extract-document",
      payloadSchema,
      handle: () => Promise.resolve(err("boom")),
    };

    await runWorkerTick({ jobQueue, handlers: new Map([["extract-document", handler]]) }, now);

    expect(jobQueue.rows[0]).toMatchObject({ status: "pending", attempts: 1, lastError: "boom" });
  });

  it("fails a job whose type has no registered handler, terminally, on the first dispatch", async () => {
    const jobQueue = fakeJobQueue([seededJob({ type: "unknown-type" })]);

    await runWorkerTick({ jobQueue, handlers: new Map() }, now);

    expect(jobQueue.rows[0]).toMatchObject({ status: "failed", attempts: 1 });
    expect(jobQueue.rows[0]?.lastError).toContain("unknown-type");
  });

  it("fails (non-terminally) a job whose payload does not match the handler's schema", async () => {
    const jobQueue = fakeJobQueue([seededJob({ payload: { wrong: "shape" } })]);
    const handle = vi.fn();
    const handler: JobHandler<{ documentId: string }> = { type: "extract-document", payloadSchema, handle };

    await runWorkerTick({ jobQueue, handlers: new Map([["extract-document", handler]]) }, now);

    expect(handle).not.toHaveBeenCalled();
    expect(jobQueue.rows[0]).toMatchObject({ status: "pending", attempts: 1 });
  });

  it("passes attempt = job.attempts + 1, reflecting attempts already recorded by prior failures", async () => {
    const jobQueue = fakeJobQueue([seededJob({ attempts: 2 })]);
    const handle = vi.fn().mockResolvedValue(ok(undefined));
    const handler: JobHandler<{ documentId: string }> = { type: "extract-document", payloadSchema, handle };

    await runWorkerTick({ jobQueue, handlers: new Map([["extract-document", handler]]) }, now);

    expect(handle).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ attempt: 3 }));
  });
});
