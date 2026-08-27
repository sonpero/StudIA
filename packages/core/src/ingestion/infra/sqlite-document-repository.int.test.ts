import { sql } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { freshDb, type Db } from "../../../../../tests/support/db.js";
import type { Document } from "../domain/types.js";
import { SqliteDocumentRepository } from "./sqlite-document-repository.js";

const now = new Date("2026-01-01T00:00:00.000Z");

function seedUser(db: Db, id: string): void {
  db.run(
    sql`INSERT INTO users (id, username, password_hash, session_version, created_at)
        VALUES (${id}, ${`user-${id}`}, 'x', 1, ${now.toISOString()})`,
  );
}

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

describe("SqliteDocumentRepository", () => {
  let cleanup: (() => void) | undefined;
  afterEach(() => cleanup?.());

  it("creates a document and finds it back for its owner, with a computed pageCount", async () => {
    const { db, cleanup: c } = freshDb();
    cleanup = c;
    seedUser(db, "u1");
    const repo = new SqliteDocumentRepository(db);
    await repo.createDocument(aDocument());

    const found = await repo.findDocument("u1", "doc-1");

    expect(found).toEqual({ ...aDocument(), pageCount: 0 });
  });

  it("findDocument returns null for another user's document (ownership scoping)", async () => {
    const { db, cleanup: c } = freshDb();
    cleanup = c;
    seedUser(db, "u1");
    seedUser(db, "u2");
    const repo = new SqliteDocumentRepository(db);
    await repo.createDocument(aDocument({ userId: "u1" }));

    expect(await repo.findDocument("u2", "doc-1")).toBeNull();
  });

  it("countDocuments counts only the caller's documents", async () => {
    const { db, cleanup: c } = freshDb();
    cleanup = c;
    seedUser(db, "u1");
    seedUser(db, "u2");
    const repo = new SqliteDocumentRepository(db);
    await repo.createDocument(aDocument({ id: "d1", userId: "u1" }));
    await repo.createDocument(aDocument({ id: "d2", userId: "u1" }));
    await repo.createDocument(aDocument({ id: "d3", userId: "u2" }));

    expect(await repo.countDocuments("u1")).toBe(2);
  });

  it("addPage stores a page and listPages returns them ordered by index", async () => {
    const { db, cleanup: c } = freshDb();
    cleanup = c;
    seedUser(db, "u1");
    const repo = new SqliteDocumentRepository(db);
    await repo.createDocument(aDocument());
    await repo.addPage("u1", { documentId: "doc-1", index: 1, sha256: "b", storedPath: "p1", sizeBytes: 2 });
    await repo.addPage("u1", { documentId: "doc-1", index: 0, sha256: "a", storedPath: "p0", sizeBytes: 1 });

    const pages = await repo.listPages("u1", "doc-1");

    expect(pages.map((p) => p.index)).toEqual([0, 1]);
    expect((await repo.findDocument("u1", "doc-1"))?.pageCount).toBe(2);
  });

  it("addPage is a no-op for a document the caller does not own", async () => {
    const { db, cleanup: c } = freshDb();
    cleanup = c;
    seedUser(db, "u1");
    seedUser(db, "u2");
    const repo = new SqliteDocumentRepository(db);
    await repo.createDocument(aDocument({ userId: "u1" }));

    await repo.addPage("u2", { documentId: "doc-1", index: 0, sha256: "a", storedPath: "p0", sizeBytes: 1 });

    expect(await repo.listPages("u1", "doc-1")).toEqual([]);
  });

  it("rejects a duplicate sha256 within the same document at the SQL level (UNIQUE constraint)", async () => {
    const { db, cleanup: c } = freshDb();
    cleanup = c;
    seedUser(db, "u1");
    const repo = new SqliteDocumentRepository(db);
    await repo.createDocument(aDocument());
    await repo.addPage("u1", { documentId: "doc-1", index: 0, sha256: "same", storedPath: "p0", sizeBytes: 1 });

    await expect(repo.addPage("u1", { documentId: "doc-1", index: 1, sha256: "same", storedPath: "p1", sizeBytes: 1 })).rejects.toThrow();
  });

  it("findPageBySha256 finds the matching page within the document", async () => {
    const { db, cleanup: c } = freshDb();
    cleanup = c;
    seedUser(db, "u1");
    const repo = new SqliteDocumentRepository(db);
    await repo.createDocument(aDocument());
    await repo.addPage("u1", { documentId: "doc-1", index: 0, sha256: "abc", storedPath: "p0", sizeBytes: 1 });

    expect((await repo.findPageBySha256("u1", "doc-1", "abc"))?.index).toBe(0);
    expect(await repo.findPageBySha256("u1", "doc-1", "nope")).toBeNull();
  });

  it("upsertExtraction is idempotent: calling it twice leaves exactly one extraction row", async () => {
    const { db, cleanup: c } = freshDb();
    cleanup = c;
    seedUser(db, "u1");
    const repo = new SqliteDocumentRepository(db);
    await repo.createDocument(aDocument());

    await repo.upsertExtraction("u1", "doc-1", "# First", now);
    await repo.upsertExtraction("u1", "doc-1", "# Second", now);

    const rows = db.all(sql`SELECT markdown FROM extractions WHERE document_id = 'doc-1'`);
    expect(rows).toEqual([{ markdown: "# Second" }]);
  });

  it("getExtraction returns the current extraction, or null before one exists / for another user", async () => {
    const { db, cleanup: c } = freshDb();
    cleanup = c;
    seedUser(db, "u1");
    seedUser(db, "u2");
    const repo = new SqliteDocumentRepository(db);
    await repo.createDocument(aDocument());

    expect(await repo.getExtraction("u1", "doc-1")).toBeNull();

    await repo.upsertExtraction("u1", "doc-1", "# Titre", now);

    expect(await repo.getExtraction("u1", "doc-1")).toEqual({ documentId: "doc-1", markdown: "# Titre", extractedAt: now.toISOString() });
    expect(await repo.getExtraction("u2", "doc-1")).toBeNull();
  });

  it("deleteDocument removes the document and cascades to its pages and extraction, returning the deleted pages", async () => {
    const { db, cleanup: c } = freshDb();
    cleanup = c;
    seedUser(db, "u1");
    const repo = new SqliteDocumentRepository(db);
    await repo.createDocument(aDocument());
    await repo.addPage("u1", { documentId: "doc-1", index: 0, sha256: "a", storedPath: "p0", sizeBytes: 1 });
    await repo.upsertExtraction("u1", "doc-1", "# X", now);

    const deletedPages = await repo.deleteDocument("u1", "doc-1");

    expect(deletedPages?.map((p) => p.storedPath)).toEqual(["p0"]);
    expect(await repo.findDocument("u1", "doc-1")).toBeNull();
    expect(db.all(sql`SELECT * FROM pages WHERE document_id = 'doc-1'`)).toEqual([]);
    expect(db.all(sql`SELECT * FROM extractions WHERE document_id = 'doc-1'`)).toEqual([]);
  });

  it("deleteDocument returns null for another user's document, without deleting anything", async () => {
    const { db, cleanup: c } = freshDb();
    cleanup = c;
    seedUser(db, "u1");
    seedUser(db, "u2");
    const repo = new SqliteDocumentRepository(db);
    await repo.createDocument(aDocument({ userId: "u1" }));

    expect(await repo.deleteDocument("u2", "doc-1")).toBeNull();
    expect(await repo.findDocument("u1", "doc-1")).not.toBeNull();
  });

  it("rejects a document for a user that does not exist (FK enforced)", () => {
    const { db, cleanup: c } = freshDb();
    cleanup = c;
    const repo = new SqliteDocumentRepository(db);

    expect(() => repo.createDocument(aDocument({ userId: "ghost" }))).toThrow(/FOREIGN KEY/);
  });

  it(
    "listDistinctUserIds returns every user who owns at least one document, each once — " +
      "the one deliberate system-wide method, used only by the abandoned-document cleanup fan-out",
    async () => {
      const { db, cleanup: c } = freshDb();
      cleanup = c;
      seedUser(db, "u1");
      seedUser(db, "u2");
      seedUser(db, "u3");
      const repo = new SqliteDocumentRepository(db);
      await repo.createDocument(aDocument({ id: "d1", userId: "u1" }));
      await repo.createDocument(aDocument({ id: "d2", userId: "u1" }));
      await repo.createDocument(aDocument({ id: "d3", userId: "u2" }));

      const userIds = await repo.listDistinctUserIds();

      expect(userIds.sort()).toEqual(["u1", "u2"]);
    },
  );
});
