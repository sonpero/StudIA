import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { sql } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { freshDb, type Db } from "../../../../../tests/support/db.js";
import { uuidV7Generator } from "../../shared/index.js";
import { SqliteJobQueue } from "../../jobs/index.js";
import type { Document } from "../domain/types.js";
import { SqliteDocumentRepository } from "../infra/sqlite-document-repository.js";
import { LocalFileStore } from "../infra/local-file-store.js";
import { cleanupAbandonedDocuments } from "./cleanup-abandoned-documents.js";

const baseCreatedAt = new Date("2026-01-01T00:00:00.000Z");

function seedUser(db: Db, id: string): void {
  db.run(
    sql`INSERT INTO users (id, username, password_hash, session_version, created_at)
        VALUES (${id}, ${`user-${id}`}, 'x', 1, ${baseCreatedAt.toISOString()})`,
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
    createdAt: baseCreatedAt.toISOString(),
    ...overrides,
  };
}

describe("cleanupAbandonedDocuments", () => {
  let dataDir: string;
  let cleanupDb: (() => void) | undefined;

  afterEach(() => {
    cleanupDb?.();
    if (dataDir) rmSync(dataDir, { recursive: true, force: true });
  });

  it(
    "removes a document abandoned past the threshold, and its files, the same way " +
      "delete-document.ts does — while a document more recent than the threshold is never touched",
    async () => {
      const { db, cleanup } = freshDb();
      cleanupDb = cleanup;
      dataDir = mkdtempSync(path.join(tmpdir(), "studia-cleanup-"));
      seedUser(db, "u1");

      const repo = new SqliteDocumentRepository(db);
      const fileStore = new LocalFileStore(dataDir);
      const jobQueue = new SqliteJobQueue(db, uuidV7Generator);

      // Orphan: written directly to the DB, bypassing createDocument/the
      // API entirely, to simulate the post-crash/abandoned state — no
      // extract-document job was ever enqueued for it.
      await repo.createDocument(aDocument({ id: "orphan", createdAt: baseCreatedAt.toISOString() }));
      const orphanFile = await fileStore.put("u1", "orphan", 0, Buffer.from("orphan-bytes"), "jpg");
      await repo.addPage("u1", { documentId: "orphan", index: 0, sha256: "a", storedPath: orphanFile, sizeBytes: 1 });

      // Recent: also has no job yet, but was created well within the
      // threshold — exactly the state a legitimate, still-in-progress
      // upload is in for a few minutes, and must never be swept.
      const recentCreatedAt = new Date(baseCreatedAt.getTime() + 20 * 60 * 1000);
      await repo.createDocument(aDocument({ id: "recent", createdAt: recentCreatedAt.toISOString() }));
      const recentFile = await fileStore.put("u1", "recent", 0, Buffer.from("recent-bytes"), "jpg");
      await repo.addPage("u1", { documentId: "recent", index: 0, sha256: "b", storedPath: recentFile, sizeBytes: 1 });

      // Past the orphan's 30-minute threshold, still within the recent
      // document's.
      const runAt = new Date(baseCreatedAt.getTime() + 31 * 60 * 1000);
      const result = await cleanupAbandonedDocuments(
        { repo, fileStore, jobQueue },
        {},
        { jobId: "job-1", userId: "u1", attempt: 1, now: runAt },
      );

      expect(result).toEqual({ ok: true, value: undefined });
      expect(await repo.findDocument("u1", "orphan")).toBeNull();
      expect(() => readFileSync(path.join(dataDir, orphanFile))).toThrow();

      expect(await repo.findDocument("u1", "recent")).not.toBeNull();
      expect(readFileSync(path.join(dataDir, recentFile), "utf8")).toBe("recent-bytes");
    },
  );

  it("never touches a document that has an extract-document job, no matter how old", async () => {
    const { db, cleanup } = freshDb();
    cleanupDb = cleanup;
    dataDir = mkdtempSync(path.join(tmpdir(), "studia-cleanup-"));
    seedUser(db, "u1");

    const repo = new SqliteDocumentRepository(db);
    const fileStore = new LocalFileStore(dataDir);
    const jobQueue = new SqliteJobQueue(db, uuidV7Generator);

    await repo.createDocument(aDocument({ id: "in-progress", createdAt: baseCreatedAt.toISOString() }));
    await jobQueue.enqueue("u1", "extract-document", { documentId: "in-progress" }, baseCreatedAt);

    const runAt = new Date(baseCreatedAt.getTime() + 120 * 60 * 1000);
    await cleanupAbandonedDocuments({ repo, fileStore, jobQueue }, {}, { jobId: "job-2", userId: "u1", attempt: 1, now: runAt });

    expect(await repo.findDocument("u1", "in-progress")).not.toBeNull();
  });
});
