import { describe, expect, it } from "vitest";
import { fakeDocumentRepository, fakeFileStore } from "./fakes.js";
import { readPageFile } from "./read-page-file.js";
import type { Document } from "../domain/types.js";

const now = new Date("2026-01-01T00:00:00.000Z");

function aDocument(overrides: Partial<Document> = {}): Document {
  return {
    id: "doc-1",
    userId: "u1",
    title: "Cours",
    sourceType: "photo",
    status: "pending",
    pageCount: 1,
    colour: "#F87171",
    createdAt: now.toISOString(),
    ...overrides,
  };
}

describe("readPageFile", () => {
  it("reads the page's bytes for its owner", async () => {
    const repo = fakeDocumentRepository([aDocument()]);
    const fileStore = fakeFileStore();
    const storedPath = await fileStore.put("u1", "doc-1", 0, Buffer.from("page bytes"), "jpg");
    await repo.addPage("u1", { documentId: "doc-1", index: 0, sha256: "a", storedPath, sizeBytes: 10 });

    const result = await readPageFile({ repo, fileStore }, "u1", "doc-1", 0);

    expect(result.ok).toBe(true);
    expect(result.ok && result.value.bytes.toString()).toBe("page bytes");
  });

  it("rejects a page belonging to another user's document (403 at the route level)", async () => {
    const repo = fakeDocumentRepository([aDocument({ userId: "someone-else" })]);
    const fileStore = fakeFileStore();
    const storedPath = await fileStore.put("someone-else", "doc-1", 0, Buffer.from("x"), "jpg");
    await repo.addPage("someone-else", { documentId: "doc-1", index: 0, sha256: "a", storedPath, sizeBytes: 1 });

    const result = await readPageFile({ repo, fileStore }, "u1", "doc-1", 0);

    expect(result).toEqual({ ok: false, error: "not-found" });
  });

  it("rejects an out-of-range page index", async () => {
    const repo = fakeDocumentRepository([aDocument()]);
    const fileStore = fakeFileStore();

    const result = await readPageFile({ repo, fileStore }, "u1", "doc-1", 5);

    expect(result).toEqual({ ok: false, error: "not-found" });
  });
});
