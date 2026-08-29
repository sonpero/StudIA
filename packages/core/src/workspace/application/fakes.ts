import type { Document, DocumentRepository } from "../../ingestion/index.js";
import type { Notion, NotionRepository } from "../../content/index.js";
import type { Deadline, ProgressRepository } from "../../progress/index.js";
import type { CardSchedule, DueCard, ReviewRepository } from "../../review/index.js";
import type { TodoRepository } from "../domain/ports.js";
import type { Todo } from "../domain/types.js";

// In-memory test double for workspace's own port (CLAUDE.md rule 3), same
// shape as progress/application/fakes.ts's fakeProgressRepository.
export function fakeTodoRepository(seed: { todos?: Todo[] } = {}): TodoRepository & { todos: Todo[] } {
  const todos = [...(seed.todos ?? [])];

  return {
    todos,
    createTodo: (todo) => {
      todos.push(todo);
      return Promise.resolve();
    },
    listTodos: (userId) => Promise.resolve(todos.filter((t) => t.userId === userId)),
    updateTodo: (userId, id, patch) => {
      const index = todos.findIndex((t) => t.id === id && t.userId === userId);
      if (index === -1) return Promise.resolve(null);
      todos[index] = { ...todos[index]!, ...patch };
      return Promise.resolve(todos[index]);
    },
    deleteTodo: (userId, id) => {
      const index = todos.findIndex((t) => t.id === id && t.userId === userId);
      if (index === -1) return Promise.resolve(false);
      todos.splice(index, 1);
      return Promise.resolve(true);
    },
  };
}

function notImplemented(fakeName: string, method: string) {
  return () => {
    throw new Error(`${fakeName}: ${method} is not implemented, getToday does not call it`);
  };
}

// Only listDocuments is exercised by getToday.
export function fakeDocumentRepositoryForWorkspace(documents: Document[]): DocumentRepository {
  const n = (method: string) => notImplemented("fakeDocumentRepositoryForWorkspace", method);
  return {
    createDocument: n("createDocument"),
    countDocuments: n("countDocuments"),
    findDocument: n("findDocument"),
    listDocuments: (userId) => Promise.resolve(documents.filter((d) => d.userId === userId)),
    addPage: n("addPage"),
    listPages: n("listPages"),
    findPageBySha256: n("findPageBySha256"),
    getPage: n("getPage"),
    upsertExtraction: n("upsertExtraction"),
    getExtraction: n("getExtraction"),
    deleteDocument: n("deleteDocument"),
    listDistinctUserIds: n("listDistinctUserIds"),
  };
}

// Only listNotionsForUser is exercised by getToday.
export function fakeNotionRepositoryForWorkspace(notions: Notion[]): NotionRepository {
  const n = (method: string) => notImplemented("fakeNotionRepositoryForWorkspace", method);
  return {
    replaceNotionsForDocument: n("replaceNotionsForDocument"),
    listNotions: n("listNotions"),
    listNotionsForUser: (userId) => Promise.resolve(notions.filter((notion) => notion.userId === userId)),
    findNotion: n("findNotion"),
    updateNotion: n("updateNotion"),
    reorderNotions: n("reorderNotions"),
    deleteNotion: n("deleteNotion"),
    searchNotions: n("searchNotions"),
  };
}

export type FakeCardRow = { userId: string; documentId: string; notionId: string; cardId: string; schedule: CardSchedule | null };

// Only getDueCards and getCardSchedulesForUser are exercised by getToday.
export function fakeReviewRepositoryForWorkspace(dueCards: (DueCard & { userId: string })[], cardRows: FakeCardRow[]): ReviewRepository {
  const n = (method: string) => notImplemented("fakeReviewRepositoryForWorkspace", method);
  return {
    findSchedule: n("findSchedule"),
    submitReview: n("submitReview"),
    getDueCards: (userId) => Promise.resolve(dueCards.filter((c) => c.userId === userId).map(({ userId: _userId, ...card }) => card)),
    getProgress: n("getProgress"),
    getNotionsProgress: n("getNotionsProgress"),
    getCardSchedulesForDocument: n("getCardSchedulesForDocument"),
    getCardSchedulesForUser: (userId) =>
      Promise.resolve(cardRows.filter((r) => r.userId === userId).map(({ documentId, notionId, cardId, schedule }) => ({ documentId, notionId, cardId, schedule }))),
    createSession: n("createSession"),
    endSession: n("endSession"),
  };
}

// Only getDeadlinesForUser is exercised by getToday.
export function fakeProgressRepositoryForWorkspace(deadlines: Deadline[]): ProgressRepository {
  const n = (method: string) => notImplemented("fakeProgressRepositoryForWorkspace", method);
  return {
    getDeadline: n("getDeadline"),
    setDeadline: n("setDeadline"),
    deleteDeadline: n("deleteDeadline"),
    getDeadlinesForUser: (userId) => Promise.resolve(deadlines.filter((d) => d.userId === userId)),
  };
}
