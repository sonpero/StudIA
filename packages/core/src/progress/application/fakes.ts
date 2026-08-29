// In-memory test double for progress's own port (CLAUDE.md rule 3), plus
// minimal local stand-ins for the other modules' ports getProgress/
// listProgress read through — not deep imports of those modules' own
// internal fakes (not part of their index.ts public surface), same
// reasoning as review/application/fakes.ts's fakeCardRepositoryForReview.
import type { Notion, NotionRepository } from "../../content/index.js";
import type { CardSchedule, ReviewRepository } from "../../review/index.js";
import type { Deadline, ProgressRepository } from "../domain/ports.js";

export function fakeProgressRepository(seed: { deadlines?: Deadline[] } = {}): ProgressRepository & { deadlines: Deadline[] } {
  const deadlines = [...(seed.deadlines ?? [])];

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
    getDeadlinesForUser: (userId) => Promise.resolve(deadlines.filter((d) => d.userId === userId)),
  };
}

// Only listNotions/listNotionsForUser are exercised by getCourseProgress/listProgress.
export function fakeNotionRepositoryForProgress(notions: Notion[]): NotionRepository {
  const notImplemented = (method: string) => () => {
    throw new Error(`fakeNotionRepositoryForProgress: ${method} is not implemented, progress does not call it`);
  };
  return {
    replaceNotionsForDocument: notImplemented("replaceNotionsForDocument"),
    listNotions: (userId, documentId) => Promise.resolve(notions.filter((n) => n.userId === userId && n.documentId === documentId)),
    listNotionsForUser: (userId) => Promise.resolve(notions.filter((n) => n.userId === userId)),
    findNotion: notImplemented("findNotion"),
    updateNotion: notImplemented("updateNotion"),
    reorderNotions: notImplemented("reorderNotions"),
    deleteNotion: notImplemented("deleteNotion"),
    searchNotions: notImplemented("searchNotions"),
  };
}

export type FakeCardRow = { userId: string; documentId: string; notionId: string; cardId: string; schedule: CardSchedule | null };

// Only getCardSchedulesForDocument/getCardSchedulesForUser are exercised by
// getCourseProgress/listProgress.
export function fakeReviewRepositoryForProgress(cardRows: FakeCardRow[]): ReviewRepository {
  const notImplemented = (method: string) => () => {
    throw new Error(`fakeReviewRepositoryForProgress: ${method} is not implemented, progress does not call it`);
  };
  return {
    findSchedule: notImplemented("findSchedule"),
    submitReview: notImplemented("submitReview"),
    getDueCards: notImplemented("getDueCards"),
    getProgress: notImplemented("getProgress"),
    getNotionsProgress: notImplemented("getNotionsProgress"),
    getCardSchedulesForDocument: (userId, documentId) =>
      Promise.resolve(cardRows.filter((r) => r.userId === userId && r.documentId === documentId).map(({ notionId, cardId, schedule }) => ({ notionId, cardId, schedule }))),
    getCardSchedulesForUser: (userId) =>
      Promise.resolve(cardRows.filter((r) => r.userId === userId).map(({ documentId, notionId, cardId, schedule }) => ({ documentId, notionId, cardId, schedule }))),
    createSession: notImplemented("createSession"),
    endSession: notImplemented("endSession"),
  };
}
