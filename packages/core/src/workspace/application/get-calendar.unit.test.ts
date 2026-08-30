import { describe, expect, it } from "vitest";
import type { Document } from "../../ingestion/index.js";
import type { Deadline } from "../../progress/index.js";
import { fakeDocumentRepositoryForWorkspace, fakeProgressRepositoryForWorkspace, fakeTodoRepository } from "./fakes.js";
import { getCalendar } from "./get-calendar.js";
import type { Todo } from "../domain/types.js";

function aDocument(overrides: Partial<Document> = {}): Document {
  return { id: "doc-1", userId: "u1", title: "Maths", sourceType: "photo", status: "done", pageCount: 1, colour: "#F87171", createdAt: "2026-01-01T00:00:00.000Z", ...overrides };
}

function aDeadline(overrides: Partial<Deadline> = {}): Deadline {
  return { id: "d1", documentId: "doc-1", userId: "u1", date: "2026-03-10", label: null, createdAt: "2026-01-01T00:00:00.000Z", ...overrides };
}

function aTodo(overrides: Partial<Todo> = {}): Todo {
  return { id: "t1", userId: "u1", label: "Réviser", dueDate: "2026-03-10", documentId: null, done: false, source: "manual", createdAt: "2026-01-01T00:00:00.000Z", ...overrides };
}

describe("getCalendar", () => {
  it("is empty (no days) for a user with nothing at all, echoing start and end", async () => {
    const deps = { todoRepo: fakeTodoRepository(), documentRepo: fakeDocumentRepositoryForWorkspace([]), progressRepo: fakeProgressRepositoryForWorkspace([]) };

    const view = await getCalendar(deps, "u1", "2026-03-01", "2026-03-31");

    expect(view).toEqual({ start: "2026-03-01", end: "2026-03-31", days: [] });
  });

  it("composes a deadline (via getDeadlinesForUser, filtered here) and a todo (via getTodosForUserInRange) into the same day", async () => {
    const deps = {
      todoRepo: fakeTodoRepository({ todos: [aTodo({ id: "t1", dueDate: "2026-03-10" })] }),
      documentRepo: fakeDocumentRepositoryForWorkspace([aDocument({ id: "doc-1", title: "Maths", colour: "#F87171" })]),
      progressRepo: fakeProgressRepositoryForWorkspace([aDeadline({ documentId: "doc-1", date: "2026-03-10" })]),
    };

    const view = await getCalendar(deps, "u1", "2026-03-01", "2026-03-31");

    expect(view.days).toEqual([
      {
        date: "2026-03-10",
        entries: [
          { kind: "deadline", id: "d1", title: "Maths", documentId: "doc-1", colour: "#F87171", done: null },
          { kind: "todo", id: "t1", title: "Réviser", documentId: null, colour: null, done: false },
        ],
      },
    ]);
  });

  // getDeadlinesForUser (unlike getTodosForUserInRange) is not itself
  // date-scoped — a deadline outside the browsed month must still be
  // filtered out here, by filterDeadlinesInRange, or every deadline the
  // user has ever set would leak onto every month's calendar.
  it("excludes a deadline outside the browsed range, even though getDeadlinesForUser itself returns every deadline the user has", async () => {
    const deps = {
      todoRepo: fakeTodoRepository(),
      documentRepo: fakeDocumentRepositoryForWorkspace([aDocument({ id: "doc-1" })]),
      progressRepo: fakeProgressRepositoryForWorkspace([aDeadline({ documentId: "doc-1", date: "2026-06-01" })]),
    };

    const view = await getCalendar(deps, "u1", "2026-03-01", "2026-03-31");

    expect(view.days).toEqual([]);
  });

  it("scopes to the caller — another user's deadline and todo in the same range never appear", async () => {
    const deps = {
      todoRepo: fakeTodoRepository({ todos: [aTodo({ userId: "u2", dueDate: "2026-03-10" })] }),
      documentRepo: fakeDocumentRepositoryForWorkspace([aDocument({ id: "doc-1", userId: "u2" })]),
      progressRepo: fakeProgressRepositoryForWorkspace([aDeadline({ userId: "u2", documentId: "doc-1", date: "2026-03-10" })]),
    };

    const view = await getCalendar(deps, "u1", "2026-03-01", "2026-03-31");

    expect(view.days).toEqual([]);
  });
});
