// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { TodayView } from "../lib/today-api.js";
import { Today } from "./Today.js";

// Courses and todos are real (view.dueCards/notionsBelowTarget/
// upcomingDeadlines/todos, from the same GET /api/today the shipped
// Aujourd'hui already calls, and the same buildCourseCards fold —
// re-exported from TodayScreen.tsx rather than duplicated), and so is the
// add-todo flow (date, course picker, photo upload) — this file reuses
// TodayScreen.tsx's own AddTodoForm/PhotoUploadInput rather than a second,
// narrower implementation. username is a required prop now (App.tsx's own
// useAuth, not this component's own mock) — the sidebar itself moved out
// of this file entirely, promoted to the app's real AppNav
// (apps/web/src/components/AppNav.tsx), so it has no tests here any more.
// Pomodoro and study sounds stay mock.
function renderScreen(
  overrides: Partial<{ username: string; onReviewCourse: (documentId: string) => void; onOpenProposals: (jobId: string) => void }> = {},
) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <Today
        username={overrides.username ?? "alex"}
        onReviewCourse={overrides.onReviewCourse}
        onOpenProposals={overrides.onOpenProposals ?? (() => undefined)}
      />
    </QueryClientProvider>,
  );
}

function stubFetch(view: TodayView | (() => Response)) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation((url: string) => {
      if (typeof url === "string" && url.startsWith("/api/documents")) return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
      if (typeof view === "function") return Promise.resolve(view());
      return Promise.resolve(new Response(JSON.stringify(view), { status: 200 }));
    }),
  );
}

const emptyView: TodayView = { date: "2026-09-06", dueCards: [], notionsBelowTarget: [], todos: [], upcomingDeadlines: [], streak: 0 };

describe("Today (front-end prototype — courses and todos wired to real data)", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("loading state: shows a skeleton, never a bare mock", () => {
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(new Promise(() => {})));
    renderScreen();
    expect(screen.queryByText("Biologie cellulaire et génétique")).not.toBeInTheDocument();
  });

  it("error state: shows an explicit message", async () => {
    stubFetch(() => new Response(null, { status: 500 }));
    renderScreen();
    await screen.findByText(/impossible de charger/i);
  });

  it("greets the real connected user by name, not a hardcoded one", async () => {
    stubFetch(emptyView);
    renderScreen({ username: "Camille" });
    expect(await screen.findByRole("heading", { name: "Bonjour, Camille" })).toBeInTheDocument();
  });

  it("renders one card per course from the real due cards and upcoming deadlines", async () => {
    stubFetch({
      ...emptyView,
      dueCards: [{ documentId: "doc-1", documentTitle: "Biologie cellulaire et génétique", colour: "#F75757", count: 12 }],
      upcomingDeadlines: [{ documentId: "doc-1", title: "Biologie cellulaire et génétique", deadlineDate: "2026-09-14", deadlineLabel: null, daysAway: 8 }],
    });
    renderScreen();

    const card = await screen.findByTestId("course-today-card");
    expect(within(card).getByText("Biologie cellulaire et génétique")).toBeInTheDocument();
    expect(within(card).getByText("12")).toBeInTheDocument();
    expect(within(card).getByText(/fiches à revoir/)).toBeInTheDocument();
    expect(within(card).getByText("Examen dans 8 jours")).toBeInTheDocument();
    expect(within(card).getByRole("button", { name: "Réviser" })).toBeInTheDocument();
  });

  it("shows 'Tout est à jour' and a disabled button for a course with nothing due", async () => {
    stubFetch({
      ...emptyView,
      upcomingDeadlines: [{ documentId: "doc-1", title: "Fonctions quadratiques", deadlineDate: "2026-09-23", deadlineLabel: null, daysAway: 17 }],
    });
    renderScreen();

    const card = await screen.findByTestId("course-today-card");
    expect(within(card).getByText("Tout est à jour")).toBeInTheDocument();
    expect(within(card).getByRole("button", { name: "Rien à réviser" })).toBeDisabled();
  });

  it("clicking 'Réviser' calls onReviewCourse with the course's documentId", async () => {
    stubFetch({ ...emptyView, dueCards: [{ documentId: "doc-1", documentTitle: "Maths", colour: "#F75757", count: 3 }] });
    const onReviewCourse = vi.fn();
    const user = userEvent.setup();
    renderScreen({ onReviewCourse });

    await user.click(await screen.findByRole("button", { name: "Réviser" }));

    expect(onReviewCourse).toHaveBeenCalledWith("doc-1");
  });

  it("empty state: no courses have anything to show today", async () => {
    stubFetch(emptyView);
    renderScreen();
    await screen.findByText(/rien à réviser pour l'instant/i);
    expect(screen.queryByTestId("course-today-card")).not.toBeInTheDocument();
  });

  it("the greeting's summary counts the real due cards and courses", async () => {
    stubFetch({
      ...emptyView,
      dueCards: [
        { documentId: "doc-1", documentTitle: "Maths", colour: "#F75757", count: 3 },
        { documentId: "doc-2", documentTitle: "Histoire", colour: "#F36016", count: 4 },
      ],
    });
    renderScreen();
    const summary = await screen.findByText(/à réviser dans 2 cours/);
    expect(summary.textContent).toMatch(/7 fiches/);
  });

  it("renders real todos, with a due date when there is one and none when there isn't", async () => {
    stubFetch({
      ...emptyView,
      todos: [
        { id: "t1", label: "Sans date", dueDate: null, documentId: null, done: false, source: "manual", createdAt: "2026-09-01T00:00:00.000Z" },
        { id: "t2", label: "Avec date", dueDate: "2026-09-10", documentId: null, done: false, source: "manual", createdAt: "2026-09-01T00:00:00.000Z" },
      ],
    });
    renderScreen();

    await screen.findByText("Sans date");
    const dated = screen.getByText("Avec date").closest('[data-testid="today-todo-row"]') as HTMLElement;
    expect(within(dated).getByText("10 septembre 2026")).toBeInTheDocument();
    const undated = screen.getByText("Sans date").closest('[data-testid="today-todo-row"]') as HTMLElement;
    expect(within(undated).queryByText(/\d{4}/)).not.toBeInTheDocument();
  });

  it("a done todo renders struck through, and '1 restants' counts only the pending ones", async () => {
    stubFetch({
      ...emptyView,
      todos: [
        { id: "t1", label: "Fait", dueDate: null, documentId: null, done: true, source: "manual", createdAt: "2026-09-01T00:00:00.000Z" },
        { id: "t2", label: "À faire", dueDate: null, documentId: null, done: false, source: "manual", createdAt: "2026-09-01T00:00:00.000Z" },
      ],
    });
    renderScreen();

    const done = await screen.findByText("Fait");
    expect(done.className).toMatch(/line-through/);
    expect(screen.getByText("1 restants")).toBeInTheDocument();
  });

  it("checking a todo's checkbox sends done: true for that one, refreshing the list", async () => {
    const calls: { url: string; body: unknown }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string, init?: RequestInit) => {
        if (typeof url === "string" && url.startsWith("/api/documents")) return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
        if (init?.method === "PATCH") {
          calls.push({ url, body: JSON.parse(init.body as string) });
          return Promise.resolve(new Response(null, { status: 200 }));
        }
        return Promise.resolve(
          new Response(JSON.stringify({ ...emptyView, todos: [{ id: "t1", label: "Réviser", dueDate: null, documentId: null, done: false, source: "manual", createdAt: "2026-09-01T00:00:00.000Z" }] }), { status: 200 }),
        );
      }),
    );
    const user = userEvent.setup();
    renderScreen();
    await screen.findByText("Réviser");

    await user.click(screen.getByRole("checkbox", { name: "Réviser" }));

    expect(calls).toEqual([{ url: "/api/todos/t1", body: { done: true } }]);
  });

  it("the delete button removes that todo, no confirmation dialog", async () => {
    const calls: { url: string; method: string | undefined }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string, init?: RequestInit) => {
        if (typeof url === "string" && url.startsWith("/api/documents")) return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
        if (init?.method === "DELETE") {
          calls.push({ url, method: init.method });
          return Promise.resolve(new Response(null, { status: 204 }));
        }
        return Promise.resolve(
          new Response(JSON.stringify({ ...emptyView, todos: [{ id: "t1", label: "À supprimer", dueDate: null, documentId: null, done: false, source: "manual", createdAt: "2026-09-01T00:00:00.000Z" }] }), { status: 200 }),
        );
      }),
    );
    const user = userEvent.setup();
    renderScreen();
    await screen.findByText("À supprimer");

    await user.click(screen.getByRole("button", { name: "Supprimer « À supprimer »" }));

    expect(calls).toEqual([{ url: "/api/todos/t1", method: "DELETE" }]);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("the '+' button reveals the full add-todo form (label, date, course); submitting a bare label posts it with null date and course", async () => {
    const calls: { url: string; body: unknown }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string, init?: RequestInit) => {
        if (typeof url === "string" && url.startsWith("/api/documents")) return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
        if (init?.method === "POST" && url === "/api/todos") {
          calls.push({ url, body: JSON.parse(init.body as string) });
          return Promise.resolve(new Response(JSON.stringify({ id: "t1", label: "Nouveau todo", dueDate: null, documentId: null, done: false, source: "manual", createdAt: "2026-09-01T00:00:00.000Z" }), { status: 201 }));
        }
        return Promise.resolve(new Response(JSON.stringify(emptyView), { status: 200 }));
      }),
    );
    const user = userEvent.setup();
    renderScreen();
    await screen.findByText(/rien à réviser pour l'instant/i);

    await user.click(screen.getByRole("button", { name: "Ajouter un todo" }));
    await user.type(screen.getByLabelText(/nouveau todo/i), "Nouveau todo");
    await user.click(screen.getByRole("button", { name: "Ajouter" }));

    expect(calls).toEqual([{ url: "/api/todos", body: { label: "Nouveau todo", dueDate: null, documentId: null } }]);
    expect(screen.getByRole("button", { name: "Ajouter un todo" })).toBeInTheDocument();
    expect(screen.queryByLabelText(/nouveau todo/i)).not.toBeInTheDocument();
  });

  it("filling in the date field posts it as the todo's dueDate", async () => {
    const calls: { url: string; body: unknown }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string, init?: RequestInit) => {
        if (typeof url === "string" && url.startsWith("/api/documents")) return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
        if (init?.method === "POST" && url === "/api/todos") {
          calls.push({ url, body: JSON.parse(init.body as string) });
          return Promise.resolve(new Response(JSON.stringify({ id: "t1", label: "Réviser", dueDate: "2026-09-20", documentId: null, done: false, source: "manual", createdAt: "2026-09-01T00:00:00.000Z" }), { status: 201 }));
        }
        return Promise.resolve(new Response(JSON.stringify(emptyView), { status: 200 }));
      }),
    );
    const user = userEvent.setup();
    renderScreen();
    await screen.findByText(/rien à réviser pour l'instant/i);

    await user.click(screen.getByRole("button", { name: "Ajouter un todo" }));
    await user.type(screen.getByLabelText(/nouveau todo/i), "Réviser");
    await user.type(screen.getByLabelText(/date/i), "2026-09-20");
    await user.click(screen.getByRole("button", { name: "Ajouter" }));

    expect(calls).toEqual([{ url: "/api/todos", body: { label: "Réviser", dueDate: "2026-09-20", documentId: null } }]);
  });

  it("picking a course in the add-todo form posts its documentId", async () => {
    const calls: { url: string; body: unknown }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string, init?: RequestInit) => {
        if (typeof url === "string" && url.startsWith("/api/documents")) {
          return Promise.resolve(new Response(JSON.stringify([{ id: "doc-1", title: "Maths", createdAt: "2026-01-01T00:00:00.000Z" }]), { status: 200 }));
        }
        if (init?.method === "POST" && url === "/api/todos") {
          calls.push({ url, body: JSON.parse(init.body as string) });
          return Promise.resolve(new Response(JSON.stringify({ id: "t1", label: "Réviser", dueDate: null, documentId: "doc-1", done: false, source: "manual", createdAt: "2026-09-01T00:00:00.000Z" }), { status: 201 }));
        }
        return Promise.resolve(new Response(JSON.stringify(emptyView), { status: 200 }));
      }),
    );
    const user = userEvent.setup();
    renderScreen();
    await screen.findByText(/rien à réviser pour l'instant/i);

    await user.click(screen.getByRole("button", { name: "Ajouter un todo" }));
    await user.type(screen.getByLabelText(/nouveau todo/i), "Réviser");
    await user.selectOptions(screen.getByLabelText(/^cours/i), "doc-1");
    await user.click(screen.getByRole("button", { name: "Ajouter" }));

    expect(calls).toEqual([{ url: "/api/todos", body: { label: "Réviser", dueDate: null, documentId: "doc-1" } }]);
  });

  it("offers a second, discreet trigger to add a todo from a planner photo, closed by default", async () => {
    stubFetch(emptyView);
    const user = userEvent.setup();
    renderScreen();
    await screen.findByText(/rien à réviser pour l'instant/i);

    expect(screen.queryByLabelText(/photo de l'agenda/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /ajouter depuis une photo/i }));

    expect(screen.getByLabelText(/photo de l'agenda/i)).toBeInTheDocument();
  });

  it("uploading a photo calls onOpenProposals with the returned job id", async () => {
    const onOpenProposals = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string, init?: RequestInit) => {
        if (typeof url === "string" && url.startsWith("/api/documents")) return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
        if (init?.method === "POST" && typeof url === "string" && url.includes("from-photo")) {
          return Promise.resolve(new Response(JSON.stringify({ jobId: "job-1" }), { status: 202 }));
        }
        return Promise.resolve(new Response(JSON.stringify(emptyView), { status: 200 }));
      }),
    );
    const user = userEvent.setup();
    renderScreen({ onOpenProposals });
    await screen.findByText(/rien à réviser pour l'instant/i);
    await user.click(screen.getByRole("button", { name: /ajouter depuis une photo/i }));

    const input = screen.getByLabelText(/photo de l'agenda/i);
    const file = new File(["fake-bytes"], "agenda.jpg", { type: "image/jpeg" });
    await user.upload(input, file);

    expect(onOpenProposals).toHaveBeenCalledWith("job-1");
  });

  it("renders the pomodoro card with its segmented tabs and a start action (still mock)", async () => {
    stubFetch(emptyView);
    renderScreen();
    await screen.findByText(/rien à réviser pour l'instant/i);
    expect(screen.getByText("Pomodoro")).toBeInTheDocument();
    expect(screen.getByText("25:00")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Démarrer" })).toBeInTheDocument();
  });

  it("renders the study sounds card (still mock)", async () => {
    stubFetch(emptyView);
    renderScreen();
    await screen.findByText(/rien à réviser pour l'instant/i);
    expect(screen.getByText("Sons d'ambiance")).toBeInTheDocument();
    expect(screen.getAllByText("Rainy Window")).toHaveLength(2);
  });
});
