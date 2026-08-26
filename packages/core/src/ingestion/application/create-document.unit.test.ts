import { describe, expect, it } from "vitest";
import { fakeDocumentRepository } from "./fakes.js";
import { createDocument } from "./create-document.js";

const now = new Date("2026-01-01T00:00:00.000Z");
const idGenerator = { next: () => "doc-1" };

describe("createDocument", () => {
  it("creates a pending document with the first palette colour for a user's first document", async () => {
    const repo = fakeDocumentRepository();

    const doc = await createDocument({ repo, idGenerator }, "u1", "Chapitre 3", "photo", now);

    expect(doc).toEqual({
      id: "doc-1",
      userId: "u1",
      title: "Chapitre 3",
      sourceType: "photo",
      status: "pending",
      pageCount: 0,
      colour: "#F87171",
      createdAt: now.toISOString(),
    });
    expect(repo.docs).toEqual([doc]);
  });

  it("rotates the colour palette for a user's later documents, independent of other users", async () => {
    const repo = fakeDocumentRepository([
      { id: "d0", userId: "u1", title: "A", sourceType: "pdf", status: "done", pageCount: 1, colour: "#F87171", createdAt: now.toISOString() },
    ]);

    const doc = await createDocument({ repo, idGenerator }, "u1", "B", "pdf", now);

    expect(doc.colour).toBe("#F5B940");
  });
});
