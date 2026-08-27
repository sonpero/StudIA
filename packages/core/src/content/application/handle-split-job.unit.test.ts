import { describe, expect, it } from "vitest";
import { err, ok } from "../../shared/index.js";
import { uuidV7Generator } from "../../shared/index.js";
import { fakeDocumentRepositoryForContent, fakeNotionRepository, fakeNotionSplitter } from "./fakes.js";
import { handleSplitJob } from "./handle-split-job.js";

const now = new Date("2026-01-01T00:00:00.000Z");

function manyNotions(count: number, prefix = "Notion") {
  return Array.from({ length: count }, (_, i) => ({
    title: `${prefix} ${String(i)}`,
    body: `Corps de la notion ${String(i)}.`,
    difficulty: "medium" as const,
  }));
}

describe("handleSplitJob", () => {
  it("writes notions from a single-chunk document, contiguously positioned from 0", async () => {
    const notionRepo = fakeNotionRepository();
    const documentRepo = fakeDocumentRepositoryForContent({
      documentId: "doc-1",
      markdown: "# Chapitre 1\n\nContenu.",
      extractedAt: now.toISOString(),
    });
    const splitter = fakeNotionSplitter(() => Promise.resolve(ok(manyNotions(5))));

    const result = await handleSplitJob(
      { notionRepo, documentRepo, splitter, idGenerator: uuidV7Generator },
      { documentId: "doc-1" },
      { jobId: "job-1", userId: "u1", attempt: 1, now },
    );

    expect(result).toEqual({ ok: true, value: undefined });
    const written = await notionRepo.listNotions("u1", "doc-1");
    expect(written).toHaveLength(5);
    expect(written.map((n) => n.position)).toEqual([0, 1, 2, 3, 4]);
    expect(written.every((n) => n.userId === "u1" && n.documentId === "doc-1")).toBe(true);
  });

  it("is idempotent: running it twice leaves exactly one set of notions", async () => {
    const notionRepo = fakeNotionRepository();
    const documentRepo = fakeDocumentRepositoryForContent({
      documentId: "doc-1",
      markdown: "# Chapitre 1\n\nContenu.",
      extractedAt: now.toISOString(),
    });
    const splitter = fakeNotionSplitter(() => Promise.resolve(ok(manyNotions(5))));
    const deps = { notionRepo, documentRepo, splitter, idGenerator: uuidV7Generator };

    await handleSplitJob(deps, { documentId: "doc-1" }, { jobId: "job-1", userId: "u1", attempt: 1, now });
    await handleSplitJob(deps, { documentId: "doc-1" }, { jobId: "job-2", userId: "u1", attempt: 1, now });

    expect(await notionRepo.listNotions("u1", "doc-1")).toHaveLength(5);
  });

  it("renumbers globally across chunks, in chunk order", async () => {
    const notionRepo = fakeNotionRepository();
    const documentRepo = fakeDocumentRepositoryForContent({
      documentId: "doc-1",
      markdown: "# Chapitre 1\n\nA.\n\n# Chapitre 2\n\nB.",
      extractedAt: now.toISOString(),
    });
    let call = 0;
    const splitter = fakeNotionSplitter(() => {
      call += 1;
      return Promise.resolve(ok(manyNotions(3, call === 1 ? "Ch1" : "Ch2")));
    });

    await handleSplitJob(
      { notionRepo, documentRepo, splitter, idGenerator: uuidV7Generator },
      { documentId: "doc-1" },
      { jobId: "job-1", userId: "u1", attempt: 1, now },
    );

    const written = await notionRepo.listNotions("u1", "doc-1");
    expect(written.map((n) => n.title)).toEqual(["Ch1 0", "Ch1 1", "Ch1 2", "Ch2 0", "Ch2 1", "Ch2 2"]);
    expect(written.map((n) => n.position)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it("fails the job when the extraction has no notion.-sized content (no chunks)", async () => {
    const notionRepo = fakeNotionRepository();
    const documentRepo = fakeDocumentRepositoryForContent({ documentId: "doc-1", markdown: "", extractedAt: now.toISOString() });
    const splitter = fakeNotionSplitter();

    const result = await handleSplitJob(
      { notionRepo, documentRepo, splitter, idGenerator: uuidV7Generator },
      { documentId: "doc-1" },
      { jobId: "job-1", userId: "u1", attempt: 1, now },
    );

    expect(result.ok).toBe(false);
    expect(await notionRepo.listNotions("u1", "doc-1")).toHaveLength(0);
  });

  it("fails the job when there is no extraction to read", async () => {
    const notionRepo = fakeNotionRepository();
    const documentRepo = fakeDocumentRepositoryForContent(null);
    const splitter = fakeNotionSplitter();

    const result = await handleSplitJob(
      { notionRepo, documentRepo, splitter, idGenerator: uuidV7Generator },
      { documentId: "doc-1" },
      { jobId: "job-1", userId: "u1", attempt: 1, now },
    );

    expect(result.ok).toBe(false);
  });

  it("fails the job, without writing anything, when the splitter itself errors", async () => {
    const notionRepo = fakeNotionRepository();
    const documentRepo = fakeDocumentRepositoryForContent({
      documentId: "doc-1",
      markdown: "# Chapitre 1\n\nContenu.",
      extractedAt: now.toISOString(),
    });
    const splitter = fakeNotionSplitter(() => Promise.resolve(err({ kind: "model-error", message: "boom" })));

    const result = await handleSplitJob(
      { notionRepo, documentRepo, splitter, idGenerator: uuidV7Generator },
      { documentId: "doc-1" },
      { jobId: "job-1", userId: "u1", attempt: 1, now },
    );

    expect(result).toEqual({ ok: false, error: "boom" });
    expect(await notionRepo.listNotions("u1", "doc-1")).toHaveLength(0);
  });

  it("fails the job when the total notion count is outside 5-60, without writing anything", async () => {
    const notionRepo = fakeNotionRepository();
    const documentRepo = fakeDocumentRepositoryForContent({
      documentId: "doc-1",
      markdown: "# Chapitre 1\n\nContenu.",
      extractedAt: now.toISOString(),
    });
    const splitter = fakeNotionSplitter(() => Promise.resolve(ok(manyNotions(3))));

    const result = await handleSplitJob(
      { notionRepo, documentRepo, splitter, idGenerator: uuidV7Generator },
      { documentId: "doc-1" },
      { jobId: "job-1", userId: "u1", attempt: 1, now },
    );

    expect(result.ok).toBe(false);
    expect(await notionRepo.listNotions("u1", "doc-1")).toHaveLength(0);
  });

  it("fails the job when two chunks independently produce the same title, without writing anything", async () => {
    const notionRepo = fakeNotionRepository();
    const documentRepo = fakeDocumentRepositoryForContent({
      documentId: "doc-1",
      markdown: "# Chapitre 1\n\nA.\n\n# Chapitre 2\n\nB.",
      extractedAt: now.toISOString(),
    });
    const splitter = fakeNotionSplitter(() => Promise.resolve(ok(manyNotions(5, "Introduction"))));

    const result = await handleSplitJob(
      { notionRepo, documentRepo, splitter, idGenerator: uuidV7Generator },
      { documentId: "doc-1" },
      { jobId: "job-1", userId: "u1", attempt: 1, now },
    );

    expect(result.ok).toBe(false);
    expect(await notionRepo.listNotions("u1", "doc-1")).toHaveLength(0);
  });
});
