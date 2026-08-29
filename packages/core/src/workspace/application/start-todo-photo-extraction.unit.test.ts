import { describe, expect, it } from "vitest";
import { fakeFileStore, fakeJobQueueForWorkspace } from "./fakes.js";
import { startTodoPhotoExtraction } from "./start-todo-photo-extraction.js";

const now = new Date("2026-03-02T09:00:00.000Z");

describe("startTodoPhotoExtraction", () => {
  it("writes the photo, then enqueues an extract-todos job whose payload names the written path", async () => {
    const fileStore = fakeFileStore();
    const jobQueue = fakeJobQueueForWorkspace();
    let idCalls = 0;
    const idGenerator = { next: () => `id-${String(idCalls++)}` };

    const result = await startTodoPhotoExtraction({ fileStore, jobQueue, idGenerator }, "u1", Buffer.from("photo-bytes"), "image/jpeg", now);

    expect(result).toEqual({ jobId: "job-0" });
    expect(jobQueue.rows).toHaveLength(1);
    const job = jobQueue.rows[0]!;
    expect(job.type).toBe("extract-todos");
    const payload = job.payload as { storedPath: string };
    expect(fileStore.files.has(payload.storedPath)).toBe(true);
    expect(fileStore.files.get(payload.storedPath)).toEqual(Buffer.from("photo-bytes"));
  });

  it("the upload's id is not the job's id: the job doesn't exist yet when the file is named", async () => {
    const fileStore = fakeFileStore();
    const jobQueue = fakeJobQueueForWorkspace();

    const result = await startTodoPhotoExtraction({ fileStore, jobQueue, idGenerator: { next: () => "id-0" } }, "u1", Buffer.from("x"), "image/jpeg", now);

    const payload = jobQueue.rows[0]!.payload as { storedPath: string };
    expect(payload.storedPath).not.toContain(result.jobId);
  });

  it("derives the extension from the mimetype, falling back to bin for an unrecognised one", async () => {
    const fileStore = fakeFileStore();
    const jobQueue = fakeJobQueueForWorkspace();

    await startTodoPhotoExtraction({ fileStore, jobQueue, idGenerator: { next: () => "id-0" } }, "u1", Buffer.from("x"), "image/png", now);
    await startTodoPhotoExtraction({ fileStore, jobQueue, idGenerator: { next: () => "id-1" } }, "u1", Buffer.from("x"), "application/octet-stream", now);

    const paths = [...fileStore.files.keys()];
    expect(paths.some((p) => p.endsWith(".png"))).toBe(true);
    expect(paths.some((p) => p.endsWith(".bin"))).toBe(true);
  });
});
