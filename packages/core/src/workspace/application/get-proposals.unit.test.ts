import { describe, expect, it } from "vitest";
import type { Job } from "../../jobs/index.js";
import type { TodoProposal } from "../domain/types.js";
import { fakeJobQueueForWorkspace, fakeTodoRepository } from "./fakes.js";
import { getProposals } from "./get-proposals.js";

const now = new Date("2026-03-02T09:00:00.000Z");

function aJob(overrides: Partial<Job> = {}): Job {
  return {
    id: "job-1",
    userId: "u1",
    type: "extract-todos",
    payload: { storedPath: "u1/upload-1/0.jpg" },
    status: "done",
    attempts: 1,
    maxAttempts: 3,
    lastError: null,
    runAfter: now.toISOString(),
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    ...overrides,
  };
}

function aProposal(overrides: Partial<TodoProposal> = {}): TodoProposal {
  return { id: "p1", jobId: "job-1", userId: "u1", label: "Rendre le devoir de maths", dueDate: "2026-03-10", subjectHint: "Maths", createdAt: now.toISOString(), ...overrides };
}

describe("getProposals", () => {
  it("returns the job's status and its proposals for their owner", async () => {
    const repo = fakeTodoRepository({ proposals: [aProposal()] });
    const jobQueue = fakeJobQueueForWorkspace([aJob({ status: "done" })]);

    const result = await getProposals({ repo, jobQueue }, "u1", "job-1");

    expect(result).toEqual({ ok: true, value: { status: "done", lastError: null, proposals: [aProposal()] } });
  });

  it("still-running: status is pending/running, proposals empty — distinct from a finished empty result", async () => {
    const repo = fakeTodoRepository({ proposals: [] });
    const jobQueue = fakeJobQueueForWorkspace([aJob({ status: "running" })]);

    const result = await getProposals({ repo, jobQueue }, "u1", "job-1");

    expect(result).toEqual({ ok: true, value: { status: "running", lastError: null, proposals: [] } });
  });

  it("failed: carries the job's own readable lastError, never a raw code", async () => {
    const repo = fakeTodoRepository({ proposals: [] });
    const jobQueue = fakeJobQueueForWorkspace([aJob({ status: "failed", lastError: "La photo est trop floue pour être lue." })]);

    const result = await getProposals({ repo, jobQueue }, "u1", "job-1");

    expect(result).toEqual({ ok: true, value: { status: "failed", lastError: "La photo est trop floue pour être lue.", proposals: [] } });
  });

  it("a legible-but-empty photo's job is done with an empty array, not not-found and not failed", async () => {
    const repo = fakeTodoRepository({ proposals: [] });
    const jobQueue = fakeJobQueueForWorkspace([aJob({ status: "done" })]);

    const result = await getProposals({ repo, jobQueue }, "u1", "job-1");

    expect(result).toEqual({ ok: true, value: { status: "done", lastError: null, proposals: [] } });
  });

  it("returns Err('not-found') for a job belonging to another user", async () => {
    const repo = fakeTodoRepository({ proposals: [aProposal()] });
    const jobQueue = fakeJobQueueForWorkspace([aJob()]);

    const result = await getProposals({ repo, jobQueue }, "u2", "job-1");

    expect(result).toEqual({ ok: false, error: "not-found" });
  });

  it("returns Err('not-found') for a jobId that does not exist", async () => {
    const repo = fakeTodoRepository();
    const jobQueue = fakeJobQueueForWorkspace([]);

    const result = await getProposals({ repo, jobQueue }, "u1", "missing");

    expect(result).toEqual({ ok: false, error: "not-found" });
  });
});
