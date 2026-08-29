import { describe, expect, it } from "vitest";
import type { Job } from "../../jobs/index.js";
import type { TodoProposal } from "../domain/types.js";
import { fakeFileStore, fakeJobQueueForWorkspace, fakeTodoRepository } from "./fakes.js";
import { rejectProposals } from "./reject-proposals.js";

const now = new Date("2026-03-02T09:00:00.000Z");

function aJob(overrides: Partial<Job> = {}): Job {
  return {
    id: "job-1",
    userId: "u1",
    type: "extract-todos",
    payload: { storedPath: "u1/job-1/0.jpg" },
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

describe("rejectProposals", () => {
  it("deletes every proposal for the job and the uploaded photo, creating no todos", async () => {
    const repo = fakeTodoRepository({ proposals: [aProposal()] });
    const jobQueue = fakeJobQueueForWorkspace([aJob()]);
    const fileStore = fakeFileStore();
    fileStore.files.set("u1/job-1/0.jpg", Buffer.from("photo"));

    const result = await rejectProposals({ repo, jobQueue, fileStore }, "u1", "job-1");

    expect(result).toEqual({ ok: true, value: undefined });
    expect(await repo.listProposals("u1", "job-1")).toEqual([]);
    expect(repo.todos).toEqual([]);
    expect(fileStore.files.has("u1/job-1/0.jpg")).toBe(false);
  });

  it("does not fail when the photo is already gone (a retried reject)", async () => {
    const repo = fakeTodoRepository({ proposals: [aProposal()] });
    const jobQueue = fakeJobQueueForWorkspace([aJob()]);
    const fileStore = fakeFileStore();

    const result = await rejectProposals({ repo, jobQueue, fileStore }, "u1", "job-1");

    expect(result.ok).toBe(true);
  });

  it("a legible-but-empty photo's job (zero proposals) is still rejectable, and its file still gets deleted", async () => {
    const repo = fakeTodoRepository({ proposals: [] });
    const jobQueue = fakeJobQueueForWorkspace([aJob()]);
    const fileStore = fakeFileStore();
    fileStore.files.set("u1/job-1/0.jpg", Buffer.from("photo"));

    const result = await rejectProposals({ repo, jobQueue, fileStore }, "u1", "job-1");

    expect(result).toEqual({ ok: true, value: undefined });
    expect(fileStore.files.has("u1/job-1/0.jpg")).toBe(false);
  });

  it("returns Err('not-found') for a job belonging to another user, touching neither proposals nor the file", async () => {
    const repo = fakeTodoRepository({ proposals: [aProposal()] });
    const jobQueue = fakeJobQueueForWorkspace([aJob()]);
    const fileStore = fakeFileStore();
    fileStore.files.set("u1/job-1/0.jpg", Buffer.from("photo"));

    const result = await rejectProposals({ repo, jobQueue, fileStore }, "u2", "job-1");

    expect(result).toEqual({ ok: false, error: "not-found" });
    expect(await repo.listProposals("u1", "job-1")).toEqual([aProposal()]);
    expect(fileStore.files.has("u1/job-1/0.jpg")).toBe(true);
  });
});
