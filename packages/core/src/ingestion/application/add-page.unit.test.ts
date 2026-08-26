import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { fakeDocumentRepository, fakeFileStore } from "./fakes.js";
import { addPage } from "./add-page.js";
import type { Document } from "../domain/types.js";

const now = new Date("2026-01-01T00:00:00.000Z");

function aDocument(overrides: Partial<Document> = {}): Document {
  return {
    id: "doc-1",
    userId: "u1",
    title: "Cours",
    sourceType: "photo",
    status: "pending",
    pageCount: 0,
    colour: "#F87171",
    createdAt: now.toISOString(),
    ...overrides,
  };
}

const sha256 = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");

describe("addPage", () => {
  it("stores the first page at index 0", async () => {
    const repo = fakeDocumentRepository([aDocument()]);
    const fileStore = fakeFileStore();
    const bytes = Buffer.from("page-1-bytes");

    const result = await addPage({ repo, fileStore }, "u1", "doc-1", bytes, "image/jpeg", "photo.jpg", now);

    expect(result).toEqual({
      ok: true,
      value: { documentId: "doc-1", index: 0, sha256: sha256(bytes), storedPath: expect.any(String) as string, sizeBytes: bytes.length },
    });
    expect(repo.pages).toHaveLength(1);
    expect(fileStore.files.size).toBe(1);
  });

  it("assigns contiguous indices to successive pages", async () => {
    const repo = fakeDocumentRepository([aDocument()]);
    const fileStore = fakeFileStore();

    await addPage({ repo, fileStore }, "u1", "doc-1", Buffer.from("a"), "image/jpeg", "a.jpg", now);
    const second = await addPage({ repo, fileStore }, "u1", "doc-1", Buffer.from("b"), "image/jpeg", "b.jpg", now);

    expect(second.ok && second.value.index).toBe(1);
  });

  it("rejects a document that does not belong to the caller", async () => {
    const repo = fakeDocumentRepository([aDocument({ userId: "someone-else" })]);
    const fileStore = fakeFileStore();

    const result = await addPage({ repo, fileStore }, "u1", "doc-1", Buffer.from("a"), "image/jpeg", "a.jpg", now);

    expect(result).toEqual({ ok: false, error: "not-found" });
  });

  it("rejects an unsupported MIME type", async () => {
    const repo = fakeDocumentRepository([aDocument()]);
    const fileStore = fakeFileStore();

    const result = await addPage({ repo, fileStore }, "u1", "doc-1", Buffer.from("a"), "application/zip", "a.zip", now);

    expect(result).toEqual({ ok: false, error: "unsupported" });
  });

  it("rejects a page over the 20 MB size limit", async () => {
    const repo = fakeDocumentRepository([aDocument()]);
    const fileStore = fakeFileStore();
    const tooBig = Buffer.alloc(20 * 1024 * 1024 + 1);

    const result = await addPage({ repo, fileStore }, "u1", "doc-1", tooBig, "image/jpeg", "a.jpg", now);

    expect(result).toEqual({ ok: false, error: "too-large" });
  });

  it("rejects the same photo uploaded twice to the same document (dedup by sha256)", async () => {
    const repo = fakeDocumentRepository([aDocument()]);
    const fileStore = fakeFileStore();
    const bytes = Buffer.from("identical-bytes");
    await addPage({ repo, fileStore }, "u1", "doc-1", bytes, "image/jpeg", "a.jpg", now);

    const result = await addPage({ repo, fileStore }, "u1", "doc-1", bytes, "image/jpeg", "a-copy.jpg", now);

    expect(result).toEqual({ ok: false, error: "duplicate" });
    expect(repo.pages).toHaveLength(1);
  });

  it("allows the same photo bytes to appear in two different documents", async () => {
    const repo = fakeDocumentRepository([aDocument({ id: "doc-1" }), aDocument({ id: "doc-2" })]);
    const fileStore = fakeFileStore();
    const bytes = Buffer.from("shared-bytes");
    await addPage({ repo, fileStore }, "u1", "doc-1", bytes, "image/jpeg", "a.jpg", now);

    const result = await addPage({ repo, fileStore }, "u1", "doc-2", bytes, "image/jpeg", "a.jpg", now);

    expect(result.ok).toBe(true);
  });
});
