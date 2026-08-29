// In-memory test doubles for progress's own port (CLAUDE.md rule 3), plus
// minimal local stand-ins for the other modules' ports getPlan/getToday
// read through — not deep imports of those modules' own internal fakes
// (not part of their index.ts public surface), same reasoning as
// review/application/fakes.ts's fakeCardRepositoryForReview.
import type { Document, DocumentRepository } from "../../ingestion/index.js";
import type { Notion, NotionRepository } from "../../content/index.js";
import type { NotionProgress, ReviewRepository } from "../../review/index.js";
import type { Deadline, ProgressRepository } from "../domain/ports.js";
import type { Availability } from "../domain/types.js";

export function fakeProgressRepository(
  seed: { deadlines?: Deadline[]; availability?: Record<string, Availability>; history?: Record<string, { date: string; completed: boolean }[]> } = {},
): ProgressRepository & { deadlines: Deadline[] } {
  const deadlines = [...(seed.deadlines ?? [])];
  const availability = new Map(Object.entries(seed.availability ?? {}));
  const history = new Map(Object.entries(seed.history ?? {}));

  return {
    deadlines,
    getDeadline: (userId, documentId) => Promise.resolve(deadlines.find((d) => d.userId === userId && d.documentId === documentId) ?? null),
    setDeadline: (userId, deadline) => {
      const index = deadlines.findIndex((d) => d.userId === userId && d.documentId === deadline.documentId);
      if (index === -1) deadlines.push(deadline);
      else deadlines[index] = { ...deadline, id: deadlines[index]!.id };
      return Promise.resolve();
    },
    deleteDeadline: (userId, documentId) => {
      const index = deadlines.findIndex((d) => d.userId === userId && d.documentId === documentId);
      if (index !== -1) deadlines.splice(index, 1);
      return Promise.resolve();
    },
    getAvailability: (userId) => Promise.resolve(availability.get(userId) ?? null),
    setAvailability: (userId, value) => {
      availability.set(userId, value);
      return Promise.resolve();
    },
    getHistory: (userId) => Promise.resolve(history.get(userId) ?? []),
    markDayCompleted: (userId, date) => {
      const existing = history.get(userId) ?? [];
      const index = existing.findIndex((h) => h.date === date);
      if (index === -1) existing.push({ date, completed: true });
      else existing[index] = { date, completed: true };
      history.set(userId, existing);
      return Promise.resolve();
    },
  };
}

// Only listNotions is exercised by getPlan/getToday.
export function fakeNotionRepositoryForProgress(notions: Notion[]): NotionRepository {
  const notImplemented = (method: string) => () => {
    throw new Error(`fakeNotionRepositoryForProgress: ${method} is not implemented, progress does not call it`);
  };
  return {
    replaceNotionsForDocument: notImplemented("replaceNotionsForDocument"),
    listNotions: (userId, documentId) => Promise.resolve(notions.filter((n) => n.userId === userId && n.documentId === documentId)),
    findNotion: notImplemented("findNotion"),
    updateNotion: notImplemented("updateNotion"),
    reorderNotions: notImplemented("reorderNotions"),
    deleteNotion: notImplemented("deleteNotion"),
    searchNotions: notImplemented("searchNotions"),
  };
}

// Only getNotionsProgress is exercised by getPlan/getToday.
export function fakeReviewRepositoryForProgress(progress: (NotionProgress & { userId: string; documentId: string })[]): ReviewRepository {
  const notImplemented = (method: string) => () => {
    throw new Error(`fakeReviewRepositoryForProgress: ${method} is not implemented, progress does not call it`);
  };
  return {
    findSchedule: notImplemented("findSchedule"),
    submitReview: notImplemented("submitReview"),
    getDueCards: notImplemented("getDueCards"),
    getProgress: notImplemented("getProgress"),
    getNotionsProgress: (userId, documentId) =>
      Promise.resolve(progress.filter((p) => p.userId === userId && p.documentId === documentId).map(({ notionId, masteredCards, totalCards }) => ({ notionId, masteredCards, totalCards }))),
    createSession: notImplemented("createSession"),
    endSession: notImplemented("endSession"),
  };
}

// Only listDocuments is exercised by getToday.
export function fakeDocumentRepositoryForProgress(documents: Document[]): DocumentRepository {
  const notImplemented = (method: string) => () => {
    throw new Error(`fakeDocumentRepositoryForProgress: ${method} is not implemented, progress does not call it`);
  };
  return {
    createDocument: notImplemented("createDocument"),
    countDocuments: notImplemented("countDocuments"),
    findDocument: notImplemented("findDocument"),
    listDocuments: (userId) => Promise.resolve(documents.filter((d) => d.userId === userId)),
    addPage: notImplemented("addPage"),
    listPages: notImplemented("listPages"),
    findPageBySha256: notImplemented("findPageBySha256"),
    getPage: notImplemented("getPage"),
    upsertExtraction: notImplemented("upsertExtraction"),
    getExtraction: notImplemented("getExtraction"),
    deleteDocument: notImplemented("deleteDocument"),
    listDistinctUserIds: notImplemented("listDistinctUserIds"),
  };
}
