import type { Document, DocumentRepository, FileStore } from "../../ingestion/index.js";
import type { Notion, NotionRepository } from "../../content/index.js";
import type { Job, JobQueue } from "../../jobs/index.js";
import type { Deadline, ProgressRepository } from "../../progress/index.js";
import type { CardSchedule, DueCard, ReviewRepository } from "../../review/index.js";
import { ok, type Result } from "../../shared/index.js";
import type { TodoExtractionError, TodoExtractionOutput, TodoExtractor, TodoRepository } from "../domain/ports.js";
import type { PomodoroSession, Todo, TodoProposal } from "../domain/types.js";

// In-memory test double for workspace's own port (CLAUDE.md rule 3), same
// shape as progress/application/fakes.ts's fakeProgressRepository.
export function fakeTodoRepository(
  seed: { todos?: Todo[]; proposals?: TodoProposal[]; pomodoroSessions?: PomodoroSession[] } = {},
): TodoRepository & { todos: Todo[]; proposals: TodoProposal[]; pomodoroSessions: PomodoroSession[] } {
  const todos = [...(seed.todos ?? [])];
  const proposals = [...(seed.proposals ?? [])];
  const pomodoroSessions = [...(seed.pomodoroSessions ?? [])];

  return {
    todos,
    proposals,
    pomodoroSessions,
    createTodo: (todo) => {
      todos.push(todo);
      return Promise.resolve();
    },
    listTodos: (userId) => Promise.resolve(todos.filter((t) => t.userId === userId)),
    // Mirrors SqliteTodoRepository's own getTodosForUserInRange exactly
    // (inclusive bounds, dueDate: null excluded, ordered by dueDate then
    // createdAt) — a fake that behaved differently from the real
    // implementation would make get-calendar's unit tests prove nothing
    // about the real query.
    getTodosForUserInRange: (userId, start, end) =>
      Promise.resolve(
        todos
          .filter((t) => t.userId === userId && t.dueDate !== null && t.dueDate >= start && t.dueDate <= end)
          .sort((a, b) => a.dueDate!.localeCompare(b.dueDate!) || a.createdAt.localeCompare(b.createdAt)),
      ),
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
    replaceProposalsForJob: (userId, jobId, replacement) => {
      for (let i = proposals.length - 1; i >= 0; i -= 1) {
        if (proposals[i]!.jobId === jobId && proposals[i]!.userId === userId) proposals.splice(i, 1);
      }
      proposals.push(...replacement);
      return Promise.resolve();
    },
    listProposals: (userId, jobId) => Promise.resolve(proposals.filter((p) => p.jobId === jobId && p.userId === userId)),
    confirmProposals: (userId, jobId, newTodos) => {
      todos.push(...newTodos);
      for (let i = proposals.length - 1; i >= 0; i -= 1) {
        if (proposals[i]!.jobId === jobId && proposals[i]!.userId === userId) proposals.splice(i, 1);
      }
      return Promise.resolve();
    },
    deleteProposals: (userId, jobId) => {
      for (let i = proposals.length - 1; i >= 0; i -= 1) {
        if (proposals[i]!.jobId === jobId && proposals[i]!.userId === userId) proposals.splice(i, 1);
      }
      return Promise.resolve();
    },
    createPomodoroSession: (session) => {
      pomodoroSessions.push(session);
      return Promise.resolve();
    },
    endPomodoroSession: (userId, id, endedAt) => {
      const index = pomodoroSessions.findIndex((s) => s.id === id && s.userId === userId);
      if (index === -1) return Promise.resolve(null);
      pomodoroSessions[index] = { ...pomodoroSessions[index]!, endedAt };
      return Promise.resolve(pomodoroSessions[index]);
    },
    getLatestOpenPomodoroSession: (userId) => {
      const open = pomodoroSessions.filter((s) => s.userId === userId && s.endedAt === null);
      if (open.length === 0) return Promise.resolve(null);
      const latest = open.reduce((a, b) => (a.startedAt > b.startedAt ? a : b));
      return Promise.resolve(latest);
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

// Reused across the from-photo upload and job-handling paths, same shape as
// ingestion/application/fakes.ts's own fakeFileStore — deleting a missing
// key from a Map is naturally a no-op, matching LocalFileStore's real
// idempotent delete (Node's rm with force: true).
export function fakeFileStore(): FileStore & { files: Map<string, Buffer> } {
  const files = new Map<string, Buffer>();
  let counter = 0;
  return {
    files,
    put: (userId, jobId, pageIndex, bytes, ext) => {
      const path = `${userId}/${jobId}/${String(pageIndex)}-${String(counter++)}.${ext}`;
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

// Same shape as ingestion/application/fakes.ts's own fakeJobQueueForIngestion.
export function fakeJobQueueForWorkspace(seed: Job[] = []): JobQueue & { rows: Job[] } {
  const rows = [...seed];
  let counter = 0;
  return {
    rows,
    enqueue: (userId, type, payload, now) => {
      const id = `job-${String(counter++)}`;
      const nowIso = now.toISOString();
      rows.push({ id, userId, type, payload, status: "pending", attempts: 0, maxAttempts: 3, lastError: null, runAfter: nowIso, createdAt: nowIso, updatedAt: nowIso });
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

export function fakeTodoExtractor(
  impl: (input: { bytes: Buffer; today: string }) => Promise<Result<TodoExtractionOutput, TodoExtractionError>> = () =>
    Promise.resolve(ok({ todos: [{ label: "Rendre le devoir", dueDate: "2026-03-10", subject: "Maths" }], legible: true })),
): TodoExtractor {
  return { extract: (input) => impl(input) };
}
