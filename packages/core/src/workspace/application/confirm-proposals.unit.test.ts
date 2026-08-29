import { describe, expect, it } from "vitest";
import type { Job } from "../../jobs/index.js";
import type { TodoProposal } from "../domain/types.js";
import { confirmProposals } from "./confirm-proposals.js";
import { fakeFileStore, fakeJobQueueForWorkspace, fakeTodoRepository } from "./fakes.js";

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

describe("confirmProposals", () => {
  it("creates a todo for each accepted proposal, deletes every proposal for the job, and deletes the uploaded photo", async () => {
    const repo = fakeTodoRepository({ proposals: [aProposal({ id: "p1" }), aProposal({ id: "p2", label: "Non accepté" })] });
    const jobQueue = fakeJobQueueForWorkspace([aJob()]);
    const fileStore = fakeFileStore();
    fileStore.files.set("u1/job-1/0.jpg", Buffer.from("photo"));

    const result = await confirmProposals({ repo, jobQueue, fileStore, idGenerator: { next: () => "t1" } }, "u1", "job-1", ["p1"], now);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual([{ id: "t1", userId: "u1", label: "Rendre le devoir de maths", dueDate: "2026-03-10", documentId: null, done: false, source: "photo", createdAt: now.toISOString() }]);
    expect(await repo.listProposals("u1", "job-1")).toEqual([]);
    expect(fileStore.files.has("u1/job-1/0.jpg")).toBe(false);
  });

  it("with nothing accepted, still deletes the proposals and the photo, and creates no todos", async () => {
    const repo = fakeTodoRepository({ proposals: [aProposal()] });
    const jobQueue = fakeJobQueueForWorkspace([aJob()]);
    const fileStore = fakeFileStore();
    fileStore.files.set("u1/job-1/0.jpg", Buffer.from("photo"));

    const result = await confirmProposals({ repo, jobQueue, fileStore, idGenerator: { next: () => "t1" } }, "u1", "job-1", [], now);

    expect(result).toEqual({ ok: true, value: [] });
    expect(await repo.listProposals("u1", "job-1")).toEqual([]);
    expect(fileStore.files.has("u1/job-1/0.jpg")).toBe(false);
  });

  it("does not fail when the photo is already gone (a retried confirm)", async () => {
    const repo = fakeTodoRepository({ proposals: [aProposal()] });
    const jobQueue = fakeJobQueueForWorkspace([aJob()]);
    const fileStore = fakeFileStore(); // nothing at u1/job-1/0.jpg

    const result = await confirmProposals({ repo, jobQueue, fileStore, idGenerator: { next: () => "t1" } }, "u1", "job-1", ["p1"], now);

    expect(result.ok).toBe(true);
  });

  it("a legible-but-empty photo's job (zero proposals) is still confirmable, and its file still gets deleted", async () => {
    const repo = fakeTodoRepository({ proposals: [] });
    const jobQueue = fakeJobQueueForWorkspace([aJob()]);
    const fileStore = fakeFileStore();
    fileStore.files.set("u1/job-1/0.jpg", Buffer.from("photo"));

    const result = await confirmProposals({ repo, jobQueue, fileStore, idGenerator: { next: () => "t1" } }, "u1", "job-1", [], now);

    expect(result).toEqual({ ok: true, value: [] });
    expect(fileStore.files.has("u1/job-1/0.jpg")).toBe(false);
  });

  it("returns Err('not-found') for a job belonging to another user, touching neither proposals nor the file", async () => {
    const repo = fakeTodoRepository({ proposals: [aProposal()] });
    const jobQueue = fakeJobQueueForWorkspace([aJob()]);
    const fileStore = fakeFileStore();
    fileStore.files.set("u1/job-1/0.jpg", Buffer.from("photo"));

    const result = await confirmProposals({ repo, jobQueue, fileStore, idGenerator: { next: () => "t1" } }, "u2", "job-1", ["p1"], now);

    expect(result).toEqual({ ok: false, error: "not-found" });
    expect(await repo.listProposals("u1", "job-1")).toEqual([aProposal()]);
    expect(fileStore.files.has("u1/job-1/0.jpg")).toBe(true);
  });

  it("returns Err('not-found') for a jobId that does not exist", async () => {
    const repo = fakeTodoRepository();
    const jobQueue = fakeJobQueueForWorkspace([]);
    const fileStore = fakeFileStore();

    const result = await confirmProposals({ repo, jobQueue, fileStore, idGenerator: { next: () => "t1" } }, "u1", "missing", [], now);

    expect(result).toEqual({ ok: false, error: "not-found" });
  });
});
