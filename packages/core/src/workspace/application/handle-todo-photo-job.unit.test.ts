import { describe, expect, it } from "vitest";
import { ok } from "../../shared/index.js";
import { fakeFileStore, fakeTodoExtractor, fakeTodoRepository } from "./fakes.js";
import { handleTodoPhotoJob } from "./handle-todo-photo-job.js";

const now = new Date("2026-03-02T09:00:00.000Z");

async function seedUpload(fileStore: ReturnType<typeof fakeFileStore>) {
  return fileStore.put("u1", "job-1", 0, Buffer.from("fake-photo-bytes"), "jpg");
}

describe("handleTodoPhotoJob", () => {
  it("replaces the job's proposals with the extractor's output, resolving today from ctx.now", async () => {
    const repo = fakeTodoRepository();
    const fileStore = fakeFileStore();
    const storedPath = await seedUpload(fileStore);
    let receivedToday: string | undefined;
    const extractor = fakeTodoExtractor((input) => {
      receivedToday = input.today;
      return Promise.resolve(ok({ todos: [{ label: "Rendre le devoir de maths", dueDate: "2026-03-10", subject: "Maths" }], legible: true }));
    });

    const result = await handleTodoPhotoJob({ repo, fileStore, extractor, idGenerator: { next: () => "p1" } }, { storedPath }, { jobId: "job-1", userId: "u1", attempt: 1, now });

    expect(result).toEqual({ ok: true, value: undefined });
    expect(receivedToday).toBe("2026-03-02");
    expect(await repo.listProposals("u1", "job-1")).toEqual([
      { id: "p1", jobId: "job-1", userId: "u1", label: "Rendre le devoir de maths", dueDate: "2026-03-10", subjectHint: "Maths", createdAt: now.toISOString() },
    ]);
  });

  it("is idempotent: running it twice leaves exactly the latest batch of proposals, never doubled", async () => {
    const repo = fakeTodoRepository();
    const fileStore = fakeFileStore();
    const storedPath = await seedUpload(fileStore);
    let idCounter = 0;
    const deps = {
      repo,
      fileStore,
      extractor: fakeTodoExtractor(() => Promise.resolve(ok({ todos: [{ label: "Rendre le devoir", dueDate: null, subject: null }], legible: true }))),
      idGenerator: { next: () => `p${String(idCounter++)}` },
    };
    const payload = { storedPath };
    const ctx = { jobId: "job-1", userId: "u1", attempt: 1, now };

    await handleTodoPhotoJob(deps, payload, ctx);
    await handleTodoPhotoJob(deps, { ...payload }, { ...ctx, attempt: 2 });

    expect(await repo.listProposals("u1", "job-1")).toHaveLength(1);
  });

  it("a legible photo with no homework on it succeeds with zero proposals", async () => {
    const repo = fakeTodoRepository();
    const fileStore = fakeFileStore();
    const storedPath = await seedUpload(fileStore);
    const extractor = fakeTodoExtractor(() => Promise.resolve(ok({ todos: [], legible: true })));

    const result = await handleTodoPhotoJob({ repo, fileStore, extractor, idGenerator: { next: () => "p1" } }, { storedPath }, { jobId: "job-1", userId: "u1", attempt: 1, now });

    expect(result).toEqual({ ok: true, value: undefined });
    expect(await repo.listProposals("u1", "job-1")).toEqual([]);
  });

  it("an illegible photo fails the job with the extractor's reason, never a success with zero proposals", async () => {
    const repo = fakeTodoRepository();
    const fileStore = fakeFileStore();
    const storedPath = await seedUpload(fileStore);
    const extractor = fakeTodoExtractor(() => Promise.resolve(ok({ todos: [], legible: false, reason: "La photo est trop floue pour être lue." })));

    const result = await handleTodoPhotoJob({ repo, fileStore, extractor, idGenerator: { next: () => "p1" } }, { storedPath }, { jobId: "job-1", userId: "u1", attempt: 1, now });

    expect(result).toEqual({ ok: false, error: "La photo est trop floue pour être lue." });
    expect(await repo.listProposals("u1", "job-1")).toEqual([]);
  });
});
