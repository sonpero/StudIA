import { describe, expect, it } from "vitest";
import { fakeDocumentRepository, fakeFileStore } from "./fakes.js";
import { deleteDocument } from "./delete-document.js";
import type { Document } from "../domain/types.js";

const now = new Date("2026-01-01T00:00:00.000Z");

function aDocument(overrides: Partial<Document> = {}): Document {
  return {
    id: "doc-1",
    userId: "u1",
    title: "Cours",
    sourceType: "photo",
    status: "done",
    pageCount: 1,
    colour: "#F87171",
    createdAt: now.toISOString(),
    ...overrides,
  };
}

describe("deleteDocument", () => {
  it("deletes the document row and every page file on disk", async () => {
    const repo = fakeDocumentRepository([aDocument()]);
    const fileStore = fakeFileStore();
    const storedPath = await fileStore.put("u1", "doc-1", 0, Buffer.from("x"), "jpg");
    await repo.addPage("u1", { documentId: "doc-1", index: 0, sha256: "a", storedPath, sizeBytes: 1 });

    const result = await deleteDocument({ repo, fileStore }, "u1", "doc-1");

    expect(result).toEqual({ ok: true, value: undefined });
    expect(repo.docs).toHaveLength(0);
    expect(fileStore.files.has(storedPath)).toBe(false);
  });

  it("rejects deleting another user's document", async () => {
    const repo = fakeDocumentRepository([aDocument({ userId: "someone-else" })]);
    const fileStore = fakeFileStore();

    const result = await deleteDocument({ repo, fileStore }, "u1", "doc-1");

    expect(result).toEqual({ ok: false, error: "not-found" });
    expect(repo.docs).toHaveLength(1);
  });
});
