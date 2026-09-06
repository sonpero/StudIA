// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { TodayView } from "../lib/today-api.js";
import { Today } from "./Today.js";

// Courses and todos are real now (view.dueCards/notionsBelowTarget/
// upcomingDeadlines/todos, from the same GET /api/today the shipped
// Aujourd'hui already calls, and the same buildCourseCards fold —
// re-exported from TodayScreen.tsx rather than duplicated). Pomodoro,
// study sounds, and the sidebar's own streak/user chip stay mock: this
// commit only wires courses and todos, one piece at a time as agreed.
function renderScreen(overrides: Partial<{ onExit: () => void; onReviewCourse: (documentId: string) => void }> = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <Today onExit={overrides.onExit} onReviewCourse={overrides.onReviewCourse} />
    </QueryClientProvider>,
  );
}

function stubFetch(view: TodayView | (() => Response)) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation(() => {
      if (typeof view === "function") return Promise.resolve(view());
      return Promise.resolve(new Response(JSON.stringify(view), { status: 200 }));
    }),
  );
}

const emptyView: TodayView = { date: "2026-09-06", dueCards: [], notionsBelowTarget: [], todos: [], upcomingDeadlines: [], streak: 0 };

describe("Today (front-end prototype — courses and todos wired to real data)", () => {
  afterEach(() => cleanup());

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

  it("a done todo renders struck through, and '4 restants' counts only the pending ones", async () => {
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

  it("the '+' button reveals a minimal add form; submitting posts the label and collapses it", async () => {
    const calls: { url: string; body: unknown }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string, init?: RequestInit) => {
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
    await user.type(screen.getByLabelText("Nouveau todo"), "Nouveau todo");
    await user.click(screen.getByRole("button", { name: "Confirmer l'ajout" }));

    expect(calls).toEqual([{ url: "/api/todos", body: { label: "Nouveau todo", dueDate: null, documentId: null } }]);
    expect(screen.getByRole("button", { name: "Ajouter un todo" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Nouveau todo")).not.toBeInTheDocument();
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

  it("renders the sidebar: nav destinations, the streak, and the user chip (still mock)", async () => {
    stubFetch(emptyView);
    renderScreen();
    await screen.findByText(/rien à réviser pour l'instant/i);
    for (const name of ["Aujourd'hui", "Mes cours", "Notions", "Lecteur", "Progression", "Calendrier", "Tuteur"]) {
      expect(screen.getByRole("button", { name })).toBeInTheDocument();
    }
    expect(screen.getByText("Série de 9 jours")).toBeInTheDocument();
    expect(screen.getByText("Léa Martin")).toBeInTheDocument();
  });

  it("the sidebar's own 'Aujourd'hui' row calls onExit — the way back to the real app", async () => {
    stubFetch(emptyView);
    const onExit = vi.fn();
    const user = userEvent.setup();
    renderScreen({ onExit });
    await screen.findByText(/rien à réviser pour l'instant/i);

    await user.click(screen.getByRole("button", { name: "Aujourd'hui" }));

    expect(onExit).toHaveBeenCalled();
  });
});
