import { describe, expect, it } from "vitest";
import type { Document } from "../../ingestion/index.js";
import type { Notion } from "../../content/index.js";
import type { Deadline } from "../../progress/index.js";
import type { DueCard } from "../../review/index.js";
import {
  fakeDocumentRepositoryForWorkspace,
  fakeNotionRepositoryForWorkspace,
  fakeProgressRepositoryForWorkspace,
  fakeReviewRepositoryForWorkspace,
  fakeTodoRepository,
  type FakeCardRow,
} from "./fakes.js";
import { getToday } from "./get-today.js";

const NOW = new Date("2026-03-02T09:00:00.000Z");
const DAY_BOUNDARY = new Date("2026-03-03T00:00:00.000Z");

function aDocument(overrides: Partial<Document> = {}): Document {
  return { id: "doc-1", userId: "u1", title: "Maths", sourceType: "photo", status: "done", pageCount: 1, colour: "#F87171", createdAt: "2026-01-01T00:00:00.000Z", ...overrides };
}

function aNotion(overrides: Partial<Notion> = {}): Notion {
  return { id: "n1", documentId: "doc-1", userId: "u1", title: "Notion", body: "Corps.", difficulty: "medium", position: 0, createdAt: "2026-01-01T00:00:00.000Z", ...overrides };
}

function aDueCard(overrides: Partial<DueCard> = {}): DueCard & { userId: string } {
  return { userId: "u1", cardId: "c1", notionId: "n1", type: "flashcard", state: "active", question: "Q ?", answer: "R", options: null, schedule: null, ...overrides };
}

function aDeadline(overrides: Partial<Deadline> = {}): Deadline {
  return { id: "d1", documentId: "doc-1", userId: "u1", date: "2026-03-20", label: null, createdAt: "2026-02-01T00:00:00.000Z", ...overrides };
}

describe("getToday", () => {
  it("is empty in every field for a user with nothing at all, except date", async () => {
    const deps = {
      todoRepo: fakeTodoRepository(),
      documentRepo: fakeDocumentRepositoryForWorkspace([]),
      notionRepo: fakeNotionRepositoryForWorkspace([]),
      reviewRepo: fakeReviewRepositoryForWorkspace([], []),
      progressRepo: fakeProgressRepositoryForWorkspace([]),
    };

    const view = await getToday(deps, "u1", NOW, DAY_BOUNDARY);

    expect(view).toEqual({ date: "2026-03-02", dueCards: [], notionsBelowTarget: [], todos: [], upcomingDeadlines: [] });
  });

  it("groups due cards by document, via the notion each card belongs to, and omits a document with none due", async () => {
    const documents = [aDocument({ id: "doc-1", title: "Maths", colour: "#F87171" }), aDocument({ id: "doc-2", title: "Histoire", colour: "#60A5FA" })];
    const notions = [aNotion({ id: "n1", documentId: "doc-1" }), aNotion({ id: "n2", documentId: "doc-2" })];
    const dueCards = [aDueCard({ cardId: "c1", notionId: "n1" }), aDueCard({ cardId: "c2", notionId: "n1" })];
    const deps = {
      todoRepo: fakeTodoRepository(),
      documentRepo: fakeDocumentRepositoryForWorkspace(documents),
      notionRepo: fakeNotionRepositoryForWorkspace(notions),
      reviewRepo: fakeReviewRepositoryForWorkspace(dueCards, []),
      progressRepo: fakeProgressRepositoryForWorkspace([]),
    };

    const view = await getToday(deps, "u1", NOW, DAY_BOUNDARY);

    expect(view.dueCards).toEqual([{ documentId: "doc-1", documentTitle: "Maths", colour: "#F87171", count: 2 }]);
  });

  it("cross-document leakage: doc-2's due cards and behind-target notions never inflate doc-1's counts, or vice versa", async () => {
    const documents = [aDocument({ id: "doc-1" }), aDocument({ id: "doc-2", title: "Histoire" })];
    const notions = [
      aNotion({ id: "n1", documentId: "doc-1", createdAt: "2020-01-01T00:00:00.000Z" }),
      aNotion({ id: "n2", documentId: "doc-2", createdAt: "2020-01-01T00:00:00.000Z" }),
    ];
    const dueCards = [aDueCard({ cardId: "c1", notionId: "n1" })];
    const cardRows: FakeCardRow[] = [{ userId: "u1", documentId: "doc-2", notionId: "n2", cardId: "c2", schedule: null }];
    const deadlines = [aDeadline({ id: "d2", documentId: "doc-2", date: "2026-03-12", createdAt: "2026-02-20T00:00:00.000Z" })];
    const deps = {
      todoRepo: fakeTodoRepository(),
      documentRepo: fakeDocumentRepositoryForWorkspace(documents),
      notionRepo: fakeNotionRepositoryForWorkspace(notions),
      reviewRepo: fakeReviewRepositoryForWorkspace(dueCards, cardRows),
      progressRepo: fakeProgressRepositoryForWorkspace(deadlines),
    };

    const view = await getToday(deps, "u1", NOW, DAY_BOUNDARY);

    expect(view.dueCards).toEqual([{ documentId: "doc-1", documentTitle: "Maths", colour: "#F87171", count: 1 }]);
    expect(view.notionsBelowTarget).toEqual([{ documentId: "doc-2", documentTitle: "Histoire", colour: "#F87171", count: 1 }]);
  });

  it("upcoming deadlines carry the document's title and a plain daysAway, and exclude a lapsed deadline", async () => {
    const documents = [aDocument({ id: "doc-1", title: "Maths" }), aDocument({ id: "doc-2", title: "Histoire" })];
    const deadlines = [aDeadline({ documentId: "doc-1", date: "2026-03-12", label: "Contrôle" }), aDeadline({ id: "d2", documentId: "doc-2", date: "2026-01-01", label: "Ancien" })];
    const deps = {
      todoRepo: fakeTodoRepository(),
      documentRepo: fakeDocumentRepositoryForWorkspace(documents),
      notionRepo: fakeNotionRepositoryForWorkspace([]),
      reviewRepo: fakeReviewRepositoryForWorkspace([], []),
      progressRepo: fakeProgressRepositoryForWorkspace(deadlines),
    };

    const view = await getToday(deps, "u1", NOW, DAY_BOUNDARY);

    expect(view.upcomingDeadlines).toEqual([{ documentId: "doc-1", title: "Maths", deadlineDate: "2026-03-12", deadlineLabel: "Contrôle", daysAway: 10 }]);
  });

  it("passes todos through as-is, scoped to the user", async () => {
    const todo = { id: "t1", userId: "u1", label: "Réviser", dueDate: null, documentId: null, done: false, source: "manual" as const, createdAt: "2026-03-01T00:00:00.000Z" };
    const deps = {
      todoRepo: fakeTodoRepository({ todos: [todo, { ...todo, id: "t-other", userId: "u2" }] }),
      documentRepo: fakeDocumentRepositoryForWorkspace([]),
      notionRepo: fakeNotionRepositoryForWorkspace([]),
      reviewRepo: fakeReviewRepositoryForWorkspace([], []),
      progressRepo: fakeProgressRepositoryForWorkspace([]),
    };

    const view = await getToday(deps, "u1", NOW, DAY_BOUNDARY);

    expect(view.todos).toEqual([todo]);
  });

  // docs/modules/workspace.md's Use cases section claims six reads, each
  // made exactly once, and specifically that progress.listProgress is
  // never called (it would redo three of them). A prose claim isn't
  // proof: this counts every call each dependency actually receives.
  it("calls each of its six reads exactly once, never through progress.listProgress", async () => {
    const calls = { listDocuments: 0, listNotionsForUser: 0, getDueCards: 0, getCardSchedulesForUser: 0, getDeadlinesForUser: 0, listTodos: 0 };

    const documentRepo = fakeDocumentRepositoryForWorkspace([aDocument()]);
    const notionRepo = fakeNotionRepositoryForWorkspace([aNotion()]);
    const reviewRepo = fakeReviewRepositoryForWorkspace([], []);
    const progressRepo = fakeProgressRepositoryForWorkspace([]);
    const todoRepo = fakeTodoRepository();

    const deps = {
      todoRepo: { ...todoRepo, listTodos: (userId: string) => (calls.listTodos++, todoRepo.listTodos(userId)) },
      documentRepo: { ...documentRepo, listDocuments: (userId: string) => (calls.listDocuments++, documentRepo.listDocuments(userId)) },
      notionRepo: { ...notionRepo, listNotionsForUser: (userId: string) => (calls.listNotionsForUser++, notionRepo.listNotionsForUser(userId)) },
      reviewRepo: {
        ...reviewRepo,
        getDueCards: (userId: string, dayBoundary: Date, filter: { documentId?: string; notionId?: string; limit?: number }) => (
          calls.getDueCards++, reviewRepo.getDueCards(userId, dayBoundary, filter)
        ),
        getCardSchedulesForUser: (userId: string) => (calls.getCardSchedulesForUser++, reviewRepo.getCardSchedulesForUser(userId)),
      },
      progressRepo: { ...progressRepo, getDeadlinesForUser: (userId: string) => (calls.getDeadlinesForUser++, progressRepo.getDeadlinesForUser(userId)) },
    };

    await getToday(deps, "u1", NOW, DAY_BOUNDARY);

    expect(calls).toEqual({ listDocuments: 1, listNotionsForUser: 1, getDueCards: 1, getCardSchedulesForUser: 1, getDeadlinesForUser: 1, listTodos: 1 });
  });
});
