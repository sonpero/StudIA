import { describe, expect, it } from "vitest";
import { err, ok } from "../../shared/index.js";
import type { Document, Page } from "../domain/types.js";
import { fakeDocumentExtractor, fakeDocumentRepository, fakeFileStore } from "./fakes.js";
import { handleExtractionJob } from "./handle-extraction-job.js";

const now = new Date("2026-01-01T00:00:00.000Z");

function aDocument(overrides: Partial<Document> = {}): Document {
  return {
    id: "doc-1",
    userId: "u1",
    title: "Cours",
    sourceType: "photo",
    status: "pending",
    pageCount: 2,
    colour: "#F87171",
    createdAt: now.toISOString(),
    ...overrides,
  };
}

async function seedTwoPages(repo: ReturnType<typeof fakeDocumentRepository>, fileStore: ReturnType<typeof fakeFileStore>) {
  const path0 = await fileStore.put("u1", "doc-1", 0, Buffer.from("page0"), "jpg");
  const path1 = await fileStore.put("u1", "doc-1", 1, Buffer.from("page1"), "jpg");
  const pages: Page[] = [
    { documentId: "doc-1", index: 0, sha256: "a", storedPath: path0, sizeBytes: 5 },
    { documentId: "doc-1", index: 1, sha256: "b", storedPath: path1, sizeBytes: 5 },
  ];
  for (const page of pages) await repo.addPage("u1", page);
}

describe("handleExtractionJob", () => {
  it("extracts every page in order and concatenates them into one Markdown extraction", async () => {
    const repo = fakeDocumentRepository([aDocument()]);
    const fileStore = fakeFileStore();
    await seedTwoPages(repo, fileStore);
    let call = 0;
    const extractor = fakeDocumentExtractor(() => {
      call += 1;
      return Promise.resolve(ok({ markdown: `# Page ${String(call)}`, legible: true }));
    });

    const result = await handleExtractionJob(
      { repo, fileStore, extractors: [extractor] },
      { documentId: "doc-1" },
      { jobId: "j1", userId: "u1", attempt: 1, now },
    );

    expect(result).toEqual({ ok: true, value: undefined });
    expect(repo.extractions.get("doc-1")?.markdown).toBe("# Page 1\n\n# Page 2");
  });

  it("is idempotent: running it twice leaves exactly one extraction row for the document", async () => {
    const repo = fakeDocumentRepository([aDocument()]);
    const fileStore = fakeFileStore();
    await seedTwoPages(repo, fileStore);
    const extractor = fakeDocumentExtractor(() => Promise.resolve(ok({ markdown: "# X", legible: true })));
    const deps = { repo, fileStore, extractors: [extractor] };
    const payload = { documentId: "doc-1" };
    const ctx = { jobId: "j1", userId: "u1", attempt: 1, now };

    await handleExtractionJob(deps, payload, ctx);
    await handleExtractionJob(deps, payload, ctx);

    expect(repo.extractions.size).toBe(1);
  });

  it("fails the job when the extractor reports an illegible page", async () => {
    const repo = fakeDocumentRepository([aDocument({ pageCount: 1 })]);
    const fileStore = fakeFileStore();
    const path0 = await fileStore.put("u1", "doc-1", 0, Buffer.from("blurry"), "jpg");
    await repo.addPage("u1", { documentId: "doc-1", index: 0, sha256: "a", storedPath: path0, sizeBytes: 6 });
    const extractor = fakeDocumentExtractor(() =>
      Promise.resolve(ok({ markdown: "", legible: false, reason: "La photo est trop floue." })),
    );

    const result = await handleExtractionJob(
      { repo, fileStore, extractors: [extractor] },
      { documentId: "doc-1" },
      { jobId: "j1", userId: "u1", attempt: 1, now },
    );

    expect(result).toEqual({ ok: false, error: "La photo est trop floue." });
    expect(repo.extractions.size).toBe(0);
  });

  it("fails the job when the extractor itself errors", async () => {
    const repo = fakeDocumentRepository([aDocument({ pageCount: 1 })]);
    const fileStore = fakeFileStore();
    const path0 = await fileStore.put("u1", "doc-1", 0, Buffer.from("x"), "pdf");
    await repo.addPage("u1", { documentId: "doc-1", index: 0, sha256: "a", storedPath: path0, sizeBytes: 1 });
    const extractor = fakeDocumentExtractor(() => Promise.resolve(err({ kind: "corrupted-file", message: "bad zip" })));

    const result = await handleExtractionJob(
      { repo, fileStore, extractors: [extractor] },
      { documentId: "doc-1" },
      { jobId: "j1", userId: "u1", attempt: 1, now },
    );

    expect(result).toEqual({ ok: false, error: "bad zip" });
  });
});
