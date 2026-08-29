// In-memory test doubles for content's ports (CLAUDE.md rule 3: every port
// gets a real adapter and a fixture used in tests; no test hits the network
// or the filesystem through these).
import { ok, type Result } from "../../shared/index.js";
import type { DocumentRepository, Extraction } from "../../ingestion/index.js";
import type { NotionRepository, NotionSplitter, SplitError } from "../domain/ports.js";
import type { Notion, SplitNotion } from "../domain/types.js";

export function fakeNotionRepository(seed: Notion[] = []): NotionRepository & { notions: Notion[] } {
  const notions = [...seed];
  const own = (userId: string, notionId: string) => notions.find((n) => n.id === notionId && n.userId === userId);

  return {
    notions,
    replaceNotionsForDocument: (userId, documentId, replacement) => {
      for (let i = notions.length - 1; i >= 0; i--) {
        if (notions[i]?.documentId === documentId && notions[i]?.userId === userId) notions.splice(i, 1);
      }
      notions.push(...replacement);
      return Promise.resolve();
    },
    listNotions: (userId, documentId) =>
      Promise.resolve(
        notions.filter((n) => n.userId === userId && n.documentId === documentId).sort((a, b) => a.position - b.position),
      ),
    listNotionsForUser: (userId) =>
      Promise.resolve([...notions.filter((n) => n.userId === userId)].sort((a, b) => a.documentId.localeCompare(b.documentId) || a.position - b.position)),
    findNotion: (userId, notionId) => Promise.resolve(own(userId, notionId) ?? null),
    updateNotion: (userId, notionId, patch) => {
      const notion = own(userId, notionId);
      if (!notion) return Promise.resolve(null);
      Object.assign(notion, patch);
      return Promise.resolve({ ...notion });
    },
    reorderNotions: (userId, _documentId, positions) => {
      for (const { id, position } of positions) {
        const notion = own(userId, id);
        if (notion) notion.position = position;
      }
      return Promise.resolve();
    },
    deleteNotion: (userId, notionId) => {
      const index = notions.findIndex((n) => n.id === notionId && n.userId === userId);
      if (index === -1) return Promise.resolve(null);
      const [deleted] = notions.splice(index, 1);
      return Promise.resolve(deleted ?? null);
    },
    searchNotions: (userId, query) =>
      Promise.resolve(
        notions.filter(
          (n) =>
            n.userId === userId &&
            (n.title.toLowerCase().includes(query.toLowerCase()) || n.body.toLowerCase().includes(query.toLowerCase())),
        ),
      ),
  };
}

export function fakeNotionSplitter(
  impl: (markdown: string) => Promise<Result<SplitNotion[], SplitError>> = (markdown) =>
    Promise.resolve(ok([{ title: `Notion de ${markdown.slice(0, 10)}`, body: markdown, difficulty: "medium" }])),
): NotionSplitter {
  return { split: (input) => impl(input.markdown) };
}

// Minimal local stand-in for ingestion's DocumentRepository — not a deep
// import of ingestion's own internal fakes.ts (not part of ingestion/
// index.ts's public surface, same reasoning as jobs' fakeJobQueueForIngestion
// in packages/core/src/ingestion/application/fakes.ts). Only getExtraction
// is exercised by content's use cases; every other method is unused by them
// and throws if ever called by mistake.
export function fakeDocumentRepositoryForContent(extraction: Extraction | null): DocumentRepository {
  const notImplemented = (method: string) => () => {
    throw new Error(`fakeDocumentRepositoryForContent: ${method} is not implemented, content does not call it`);
  };
  return {
    createDocument: notImplemented("createDocument"),
    countDocuments: notImplemented("countDocuments"),
    findDocument: notImplemented("findDocument"),
    listDocuments: notImplemented("listDocuments"),
    addPage: notImplemented("addPage"),
    listPages: notImplemented("listPages"),
    findPageBySha256: notImplemented("findPageBySha256"),
    getPage: notImplemented("getPage"),
    upsertExtraction: notImplemented("upsertExtraction"),
    getExtraction: () => Promise.resolve(extraction),
    deleteDocument: notImplemented("deleteDocument"),
    listDistinctUserIds: notImplemented("listDistinctUserIds"),
  };
}
