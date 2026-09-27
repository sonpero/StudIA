import type { FailOptions, Job, JobContext, JobQueue, SplitJobResult } from "@studia/core";
import { describe, expect, it } from "vitest";
import { recordTerminalFailures, TerminalAwareJobQueue, TerminalFailureRegistry } from "./terminal-failures.js";

const now = new Date("2026-01-01T00:00:00.000Z");
const ctx: JobContext = { jobId: "job-1", userId: "u1", attempt: 1, now };

type FailCall = { jobId: string; error: string; options: FailOptions | undefined };

function recordingQueue(): JobQueue & { failCalls: FailCall[]; calls: string[] } {
  const failCalls: FailCall[] = [];
  const calls: string[] = [];
  const job: Job = {
    id: "job-1",
    userId: "u1",
    type: "split-notions",
    payload: {},
    status: "running",
    attempts: 0,
    maxAttempts: 3,
    lastError: null,
    runAfter: now.toISOString(),
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };
  return {
    failCalls,
    calls,
    enqueue: () => {
      calls.push("enqueue");
      return Promise.resolve("new-job");
    },
    claimNext: () => {
      calls.push("claimNext");
      return Promise.resolve(job);
    },
    complete: () => {
      calls.push("complete");
      return Promise.resolve();
    },
    fail: (jobId, error, _now, options) => {
      failCalls.push({ jobId, error, options });
      return Promise.resolve();
    },
    recoverStale: () => {
      calls.push("recoverStale");
      return Promise.resolve(2);
    },
    listJobs: () => {
      calls.push("listJobs");
      return Promise.resolve([]);
    },
  };
}

describe("TerminalAwareJobQueue", () => {
  it("fails a job flagged as terminal with { terminal: true }", async () => {
    const inner = recordingQueue();
    const registry = new TerminalFailureRegistry();
    const queue = new TerminalAwareJobQueue(inner, registry);

    registry.mark("job-1");
    await queue.fail("job-1", "truncated", now);

    expect(inner.failCalls).toEqual([{ jobId: "job-1", error: "truncated", options: { terminal: true } }]);
  });

  it("leaves an unflagged failure retryable, passing its options through untouched", async () => {
    const inner = recordingQueue();
    const queue = new TerminalAwareJobQueue(inner, new TerminalFailureRegistry());

    await queue.fail("job-1", "overloaded", now);
    await queue.fail("job-2", "no handler", now, { terminal: true });

    expect(inner.failCalls).toEqual([
      { jobId: "job-1", error: "overloaded", options: undefined },
      { jobId: "job-2", error: "no handler", options: { terminal: true } },
    ]);
  });

  it("consumes the flag: a later failure of the same job id is not terminal again", async () => {
    const inner = recordingQueue();
    const registry = new TerminalFailureRegistry();
    const queue = new TerminalAwareJobQueue(inner, registry);

    registry.mark("job-1");
    await queue.fail("job-1", "truncated", now);
    await queue.fail("job-1", "overloaded", now);

    expect(inner.failCalls.map((c) => c.options)).toEqual([{ terminal: true }, undefined]);
  });

  it("only makes the flagged job terminal", async () => {
    const inner = recordingQueue();
    const registry = new TerminalFailureRegistry();
    const queue = new TerminalAwareJobQueue(inner, registry);

    registry.mark("job-1");
    await queue.fail("job-2", "overloaded", now);

    expect(inner.failCalls).toEqual([{ jobId: "job-2", error: "overloaded", options: undefined }]);
  });

  it("delegates every other method unchanged", async () => {
    const inner = recordingQueue();
    const queue = new TerminalAwareJobQueue(inner, new TerminalFailureRegistry());

    expect(await queue.enqueue("u1", "split-notions", {}, now)).toBe("new-job");
    expect((await queue.claimNext(now))?.id).toBe("job-1");
    await queue.complete("job-1", now);
    expect(await queue.recoverStale(now)).toBe(2);
    expect(await queue.listJobs("u1", "split-notions")).toEqual([]);

    expect(inner.calls).toEqual(["enqueue", "claimNext", "complete", "recoverStale", "listJobs"]);
  });
});

describe("recordTerminalFailures", () => {
  it("flags the job id of a terminal failure and returns a plain Result", async () => {
    const registry = new TerminalFailureRegistry();
    const handle = recordTerminalFailures(registry, () => Promise.resolve<SplitJobResult>({ ok: false, error: "truncated", terminal: true }));

    const result = await handle({}, ctx);

    expect(result).toEqual({ ok: false, error: "truncated" });
    expect(registry.consume("job-1")).toBe(true);
  });

  it("flags nothing for a retryable failure or a success", async () => {
    const registry = new TerminalFailureRegistry();
    const failing = recordTerminalFailures(registry, () => Promise.resolve<SplitJobResult>({ ok: false, error: "overloaded" }));
    const succeeding = recordTerminalFailures(registry, () => Promise.resolve<SplitJobResult>({ ok: true, value: undefined }));

    expect(await failing({}, ctx)).toEqual({ ok: false, error: "overloaded" });
    expect(await succeeding({}, ctx)).toEqual({ ok: true, value: undefined });
    expect(registry.consume("job-1")).toBe(false);
  });
});
