// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { TodayView } from "../lib/today-api.js";
import { TodayScreen } from "./TodayScreen.js";

// The redesigned Aujourd'hui screen (M9's own "Today" prototype, now the
// real thing — the previous implementation and its own test file are gone).
// Courses, todos, the add-todo flow (date, course picker, photo upload) and
// the pomodoro (start/end/resume) are all wired to real data; the sidebar
// lives in the app's own AppNav now (apps/web/src/components/AppNav.tsx),
// not this screen, so it has no tests here. Only the study-sounds player
// stays mock. Every fetch stub below must answer GET /api/pomodoro/active
// (404 by default: no session in flight) or the pomodoro card's own mount
// throws.
function renderScreen(
  overrides: Partial<{ username: string; onReviewCourse: (documentId: string) => void; onOpenProposals: (jobId: string) => void }> = {},
) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <TodayScreen
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
      if (url === "/api/pomodoro/active") return Promise.resolve(new Response(null, { status: 404 }));
      if (typeof view === "function") return Promise.resolve(view());
      return Promise.resolve(new Response(JSON.stringify(view), { status: 200 }));
    }),
  );
}

const emptyView: TodayView = { date: "2026-09-06", dueCards: [], notionsBelowTarget: [], todos: [], upcomingDeadlines: [], streak: 0 };

describe("TodayScreen (Aujourd'hui)", () => {
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

  it("shows the real date above the greeting, in French, capitalised", async () => {
    stubFetch({ ...emptyView, date: "2026-09-06" });
    renderScreen();
    expect(await screen.findByText("Dimanche 6 septembre")).toBeInTheDocument();
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

  it("a todo's checkbox renders as a plain circle (rounded-full), matching the mockup — not the browser's own square checkbox", async () => {
    stubFetch({
      ...emptyView,
      todos: [{ id: "t1", label: "Réviser", dueDate: null, documentId: null, done: false, source: "manual", createdAt: "2026-09-01T00:00:00.000Z" }],
    });
    renderScreen();

    const checkbox = await screen.findByRole("checkbox", { name: "Réviser" });
    expect(checkbox.className).toMatch(/rounded-full/);
  });

  it("checking a todo's checkbox sends done: true for that one, refreshing the list", async () => {
    const calls: { url: string; body: unknown }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string, init?: RequestInit) => {
        if (typeof url === "string" && url.startsWith("/api/documents")) return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
        if (url === "/api/pomodoro/active") return Promise.resolve(new Response(null, { status: 404 }));
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
        if (url === "/api/pomodoro/active") return Promise.resolve(new Response(null, { status: 404 }));
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
        if (url === "/api/pomodoro/active") return Promise.resolve(new Response(null, { status: 404 }));
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
        if (url === "/api/pomodoro/active") return Promise.resolve(new Response(null, { status: 404 }));
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
        if (url === "/api/pomodoro/active") return Promise.resolve(new Response(null, { status: 404 }));
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

  // ÉTAPE 0 (lot 1 du pomodoro persistant): régression suspectée avant toute
  // correction. PomodoroCard garde phase/session en useState local ;
  // startMutation.onSuccess ne réécrit jamais POMODORO_ACTIVE_QUERY_KEY dans
  // le cache React Query, qui reste donc sur le null (404) capturé au tout
  // premier montage. staleTime: Infinity + refetchOnWindowFocus: false
  // empêchent tout refetch qui aurait pu corriger ça. Au démontage de
  // TodayScreen (changement d'écran) puis remontage, le useState repart de
  // zéro et activeQuery.data reste ce null en cache : la séance retombe à
  // l'affichage de repos alors qu'elle tourne toujours côté serveur. Un seul
  // QueryClient partagé entre les deux rendus, comme App.tsx le fait
  // réellement (le QueryClient vit dans App(), pas dans l'écran qui change).
  it("regression (ÉTAPE 0): a live session must stay visible across a screen remount, not revert to the at-rest display", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const startedAt = new Date().toISOString();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string, init?: RequestInit) => {
        if (typeof url === "string" && url.startsWith("/api/documents")) return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
        if (url === "/api/pomodoro/active") return Promise.resolve(new Response(null, { status: 404 }));
        if (url === "/api/pomodoro" && init?.method === "POST") {
          return Promise.resolve(
            new Response(JSON.stringify({ id: "s1", userId: "u1", todoId: null, startedAt, endedAt: null, durationSeconds: 1500 }), { status: 201 }),
          );
        }
        return Promise.resolve(new Response(JSON.stringify(emptyView), { status: 200 }));
      }),
    );
    const user = userEvent.setup();

    const { unmount } = render(
      <QueryClientProvider client={queryClient}>
        <TodayScreen username="alex" onOpenProposals={() => undefined} />
      </QueryClientProvider>,
    );
    await screen.findByText(/rien à réviser pour l'instant/i);
    await user.click(screen.getByRole("button", { name: "Démarrer" }));
    await screen.findByRole("button", { name: "Terminer" });

    // Simule un changement d'écran : TodayScreen (et PomodoroCard) se
    // démonte, mais pas le QueryClient — celui-ci vit dans App(), au-dessus
    // de la machine à états qui monte/démonte les écrans.
    unmount();

    render(
      <QueryClientProvider client={queryClient}>
        <TodayScreen username="alex" onOpenProposals={() => undefined} />
      </QueryClientProvider>,
    );
    await screen.findByText(/rien à réviser pour l'instant/i);

    // La séance tourne toujours côté serveur (aucun appel à /end n'a eu
    // lieu) : le décompte doit reprendre en direct, pas retomber à "25:00".
    expect(await screen.findByRole("button", { name: "Terminer" })).toBeInTheDocument();
  });

  it("renders the pomodoro card with its segmented tabs, a start action, and a centered, real (initially zero) session count", async () => {
    stubFetch(emptyView);
    renderScreen();
    await screen.findByText(/rien à réviser pour l'instant/i);
    expect(screen.getByText("Pomodoro")).toBeInTheDocument();
    expect(screen.getByText("25:00")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Démarrer" })).toBeInTheDocument();
    const count = screen.getByText("0 séance de concentration");
    expect(count.className).toMatch(/text-center/);
  });

  it("resumes an already-active pomodoro session on mount, showing a live countdown directly", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        if (typeof url === "string" && url.startsWith("/api/documents")) return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
        if (url === "/api/pomodoro/active") {
          return Promise.resolve(
            new Response(
              JSON.stringify({ id: "s1", userId: "u1", todoId: null, startedAt: new Date(Date.now() - 60_000).toISOString(), endedAt: null, durationSeconds: 1500 }),
              { status: 200 },
            ),
          );
        }
        return Promise.resolve(new Response(JSON.stringify(emptyView), { status: 200 }));
      }),
    );
    renderScreen();

    expect(await screen.findByRole("button", { name: "Terminer" })).toBeInTheDocument();
  });

  it("clicking 'Démarrer' starts a real pomodoro session (POST /api/pomodoro) and shows a live countdown", async () => {
    const calls: { url: string; method: string | undefined }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string, init?: RequestInit) => {
        if (typeof url === "string" && url.startsWith("/api/documents")) return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
        if (url === "/api/pomodoro/active") return Promise.resolve(new Response(null, { status: 404 }));
        if (url === "/api/pomodoro" && init?.method === "POST") {
          calls.push({ url, method: init.method });
          return Promise.resolve(
            new Response(JSON.stringify({ id: "s1", userId: "u1", todoId: null, startedAt: new Date().toISOString(), endedAt: null, durationSeconds: 1500 }), { status: 201 }),
          );
        }
        return Promise.resolve(new Response(JSON.stringify(emptyView), { status: 200 }));
      }),
    );
    const user = userEvent.setup();
    renderScreen();
    await screen.findByText(/rien à réviser pour l'instant/i);

    await user.click(screen.getByRole("button", { name: "Démarrer" }));

    expect(await screen.findByRole("button", { name: "Terminer" })).toBeInTheDocument();
    expect(calls).toEqual([{ url: "/api/pomodoro", method: "POST" }]);
  });

  it("clicking 'Démarrer' against an already-active server session (409) shows the resync notice and still displays a live countdown", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string, init?: RequestInit) => {
        if (typeof url === "string" && url.startsWith("/api/documents")) return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
        if (url === "/api/pomodoro/active") return Promise.resolve(new Response(null, { status: 404 }));
        if (url === "/api/pomodoro" && init?.method === "POST") {
          return Promise.resolve(
            new Response(JSON.stringify({ id: "s1", userId: "u1", todoId: null, startedAt: new Date().toISOString(), endedAt: null, durationSeconds: 1500 }), { status: 409 }),
          );
        }
        return Promise.resolve(new Response(JSON.stringify(emptyView), { status: 200 }));
      }),
    );
    const user = userEvent.setup();
    renderScreen();
    await screen.findByText(/rien à réviser pour l'instant/i);

    await user.click(screen.getByRole("button", { name: "Démarrer" }));

    expect(await screen.findByRole("button", { name: "Terminer" })).toBeInTheDocument();
    expect(screen.getByText("Une séance est déjà en cours.")).toBeInTheDocument();
  });

  it("clicking 'Terminer' ends the session (POST /api/pomodoro/:id/end), increments the real session count, and returns to idle", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string, init?: RequestInit) => {
        if (typeof url === "string" && url.startsWith("/api/documents")) return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
        if (url === "/api/pomodoro/active") return Promise.resolve(new Response(null, { status: 404 }));
        if (url === "/api/pomodoro" && init?.method === "POST") {
          return Promise.resolve(
            new Response(JSON.stringify({ id: "s1", userId: "u1", todoId: null, startedAt: new Date().toISOString(), endedAt: null, durationSeconds: 1500 }), { status: 201 }),
          );
        }
        if (typeof url === "string" && url.endsWith("/end") && init?.method === "POST") return Promise.resolve(new Response(null, { status: 204 }));
        return Promise.resolve(new Response(JSON.stringify(emptyView), { status: 200 }));
      }),
    );
    const user = userEvent.setup();
    renderScreen();
    await screen.findByText(/rien à réviser pour l'instant/i);
    await user.click(screen.getByRole("button", { name: "Démarrer" }));
    await screen.findByRole("button", { name: "Terminer" });

    await user.click(screen.getByRole("button", { name: "Terminer" }));

    expect(await screen.findByRole("button", { name: "Démarrer" })).toBeInTheDocument();
    expect(screen.getByText("1 séance de concentration")).toBeInTheDocument();
  });

  it("'Réinitialiser' clears the session count once at least one is completed, and stays disabled while a session runs or the count is zero", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string, init?: RequestInit) => {
        if (typeof url === "string" && url.startsWith("/api/documents")) return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
        if (url === "/api/pomodoro/active") return Promise.resolve(new Response(null, { status: 404 }));
        if (url === "/api/pomodoro" && init?.method === "POST") {
          return Promise.resolve(
            new Response(JSON.stringify({ id: "s1", userId: "u1", todoId: null, startedAt: new Date().toISOString(), endedAt: null, durationSeconds: 1500 }), { status: 201 }),
          );
        }
        if (typeof url === "string" && url.endsWith("/end") && init?.method === "POST") return Promise.resolve(new Response(null, { status: 204 }));
        return Promise.resolve(new Response(JSON.stringify(emptyView), { status: 200 }));
      }),
    );
    const user = userEvent.setup();
    renderScreen();
    await screen.findByText(/rien à réviser pour l'instant/i);

    expect(screen.getByRole("button", { name: "Réinitialiser" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Démarrer" }));
    await screen.findByRole("button", { name: "Terminer" });
    expect(screen.getByRole("button", { name: "Réinitialiser" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Terminer" }));
    await screen.findByRole("button", { name: "Démarrer" });
    expect(screen.getByRole("button", { name: "Réinitialiser" })).not.toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Réinitialiser" }));

    expect(screen.getByText("0 séance de concentration")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Réinitialiser" })).toBeDisabled();
  });

  it("renders the study sounds card (still mock)", async () => {
    stubFetch(emptyView);
    renderScreen();
    await screen.findByText(/rien à réviser pour l'instant/i);
    expect(screen.getByText("Sons d'ambiance")).toBeInTheDocument();
    expect(screen.getAllByText("Rainy Window")).toHaveLength(2);
  });
});
