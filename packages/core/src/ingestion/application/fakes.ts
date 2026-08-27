// In-memory test doubles for ingestion's ports (CLAUDE.md rule 3: every
// port gets a real adapter and a fixture used in tests; no test hits the
// network or the filesystem through these).
import type { DocumentExtractor, DocumentRepository, ExtractionError, ExtractionOutput, FileStore } from "../domain/ports.js";
import type { Document, Extraction, Page } from "../domain/types.js";
import { ok, type Result } from "../../shared/index.js";
import type { Job, JobQueue } from "../../jobs/index.js";

// A minimal local JobQueue fake, rather than importing jobs' own internal
// application/fakes.ts: that file is not part of jobs/index.ts's public
// surface, and reaching past it — even from a test — is exactly the kind of
// deep import the frozen-kernels boundary is meant to discourage.
export function fakeJobQueueForIngestion(seed: Job[] = []): JobQueue & { rows: Job[] } {
  const rows = [...seed];
  let counter = 0;
  return {
    rows,
    enqueue: (userId, type, payload, now) => {
      const id = `job-${String(counter++)}`;
      const nowIso = now.toISOString();
      rows.push({
        id,
        userId,
        type,
        payload,
        status: "pending",
        attempts: 0,
        maxAttempts: 3,
        lastError: null,
        runAfter: nowIso,
        createdAt: nowIso,
        updatedAt: nowIso,
      });
      return Promise.resolve(id);
    },
    claimNext: () => Promise.resolve(null),
    complete: () => Promise.resolve(),
    fail: () => Promise.resolve(),
    recoverStale: () => Promise.resolve(0),
    listJobs: (userId, type, createdAfter) =>
      Promise.resolve(
        rows
          .filter((row) => row.userId === userId && row.type === type && (!createdAfter || row.createdAt > createdAfter))
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
          .map((row) => ({ id: row.id, status: row.status, payload: row.payload, lastError: row.lastError })),
      ),
  };
}

export function fakeDocumentRepository(
  seedDocs: Document[] = [],
  seedPages: Page[] = [],
): DocumentRepository & { docs: Document[]; pages: Page[]; extractions: Map<string, Extraction> } {
  const docs = [...seedDocs];
  const pages = [...seedPages];
  const extractions = new Map<string, Extraction>();

  const own = (userId: string, documentId: string) => docs.find((d) => d.id === documentId && d.userId === userId);
  const withPageCount = (doc: Document): Document => ({
    ...doc,
    pageCount: pages.filter((p) => p.documentId === doc.id).length,
  });

  return {
    docs,
    pages,
    extractions,
    createDocument: (document) => {
      docs.push(document);
      return Promise.resolve();
    },
    countDocuments: (userId) => Promise.resolve(docs.filter((d) => d.userId === userId).length),
    findDocument: (userId, documentId) => {
      const doc = own(userId, documentId);
      return Promise.resolve(doc ? withPageCount(doc) : null);
    },
    listDocuments: (userId) => Promise.resolve(docs.filter((d) => d.userId === userId).map(withPageCount)),
    addPage: (userId, page) => {
      if (own(userId, page.documentId)) pages.push(page);
      return Promise.resolve();
    },
    listPages: (userId, documentId) => {
      if (!own(userId, documentId)) return Promise.resolve([]);
      return Promise.resolve(pages.filter((p) => p.documentId === documentId).sort((a, b) => a.index - b.index));
    },
    findPageBySha256: (userId, documentId, sha256) => {
      if (!own(userId, documentId)) return Promise.resolve(null);
      return Promise.resolve(pages.find((p) => p.documentId === documentId && p.sha256 === sha256) ?? null);
    },
    getPage: (userId, documentId, index) => {
      if (!own(userId, documentId)) return Promise.resolve(null);
      return Promise.resolve(pages.find((p) => p.documentId === documentId && p.index === index) ?? null);
    },
    upsertExtraction: (userId, documentId, markdown, now) => {
      if (own(userId, documentId)) extractions.set(documentId, { documentId, markdown, extractedAt: now.toISOString() });
      return Promise.resolve();
    },
    getExtraction: (userId, documentId) => {
      if (!own(userId, documentId)) return Promise.resolve(null);
      return Promise.resolve(extractions.get(documentId) ?? null);
    },
    deleteDocument: (userId, documentId) => {
      const index = docs.findIndex((d) => d.id === documentId && d.userId === userId);
      if (index === -1) return Promise.resolve(null);
      const deletedPages = pages.filter((p) => p.documentId === documentId);
      docs.splice(index, 1);
      for (let i = pages.length - 1; i >= 0; i--) {
        if (pages[i]?.documentId === documentId) pages.splice(i, 1);
      }
      extractions.delete(documentId);
      return Promise.resolve(deletedPages);
    },
    listDistinctUserIds: () => Promise.resolve([...new Set(docs.map((d) => d.userId))]),
  };
}

export function fakeFileStore(): FileStore & { files: Map<string, Buffer> } {
  const files = new Map<string, Buffer>();
  let counter = 0;
  return {
    files,
    put: (userId, documentId, pageIndex, bytes, ext) => {
      const path = `${userId}/${documentId}/${String(pageIndex)}-${String(counter++)}.${ext}`;
      files.set(path, bytes);
      return Promise.resolve(path);
    },
    read: (storedPath) => {
      const bytes = files.get(storedPath);
      if (!bytes) throw new Error(`fakeFileStore: no file at ${storedPath}`);
      return Promise.resolve(bytes);
    },
    delete: (storedPath) => {
      files.delete(storedPath);
      return Promise.resolve();
    },
  };
}

export function fakeDocumentExtractor(
  impl: (input: { bytes: Buffer; sourceType: string }) => Promise<Result<ExtractionOutput, ExtractionError>> = () =>
    Promise.resolve(ok({ markdown: "# Fake\n\nFake extracted markdown.", legible: true })),
): DocumentExtractor {
  return {
    supports: () => true,
    extract: (input) => impl(input),
  };
}
