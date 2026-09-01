// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TodayScreen } from "./TodayScreen.js";
import type { TodayView } from "../lib/today-api.js";

function renderScreen(
  overrides: Partial<{
    onOpenProposals: (jobId: string) => void;
    onOpenCourse: (documentId: string) => void;
    onReviewCourse: (documentId: string) => void;
  }> = {},
) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <TodayScreen
        onOpenProposals={overrides.onOpenProposals ?? (() => undefined)}
        onOpenCourse={overrides.onOpenCourse ?? (() => undefined)}
        onReviewCourse={overrides.onReviewCourse ?? (() => undefined)}
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

const emptyView: TodayView = { date: "2026-03-02", dueCards: [], notionsBelowTarget: [], todos: [], upcomingDeadlines: [] };

// Both the add-todo form and the photo picker are collapsed by default,
// behind their own discreet trigger (docs/UI.md's Aujourd'hui note) — every
// test below that needs the form or the file input open must click its
// trigger first, the way a real user would.
async function openAddTodoForm(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Ajouter un todo" }));
}

async function openPhotoPicker(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: /ajouter depuis une photo/i }));
}

describe("TodayScreen", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("loading state: shows a skeleton, never a bare spinner", () => {
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(new Promise(() => {})));
    renderScreen();
    expect(screen.getByRole("heading", { name: "Aujourd'hui" })).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("error state: a network failure shows the confused mascot and a retry button, never a raw error code", async () => {
    stubFetch(() => new Response(null, { status: 500 }));
    renderScreen();
    await screen.findByText(/impossible de charger/i);
    expect(screen.getByRole("button", { name: /réessayer/i })).toBeInTheDocument();
  });

  it("empty state: nothing due, nothing behind, no todos, no deadlines — an invitation, never a bare '0'", async () => {
    stubFetch(emptyView);
    renderScreen();
    await screen.findByText(/rien de prévu/i);
    expect(screen.queryByText(/^0$/)).not.toBeInTheDocument();
  });

  it("the gap between the title and what follows it is the same --space-section token in every state — loading, error and ready alike, not three different ad hoc values (docs/UI.md's Grid and spacing note)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(new Promise(() => {})));
    renderScreen();
    const loadingMain = screen.getByRole("heading", { name: "Aujourd'hui" }).closest("main");
    expect(loadingMain?.className).toMatch(/gap-\[var\(--space-section\)\]/);
    cleanup();

    stubFetch(() => new Response(null, { status: 500 }));
    renderScreen();
    await screen.findByText(/impossible de charger/i);
    const errorMain = screen.getByRole("heading", { name: "Aujourd'hui" }).closest("main");
    expect(errorMain?.className).toMatch(/gap-\[var\(--space-section\)\]/);
    cleanup();

    stubFetch(emptyView);
    renderScreen();
    await screen.findByText(/rien de prévu/i);
    const readyMain = screen.getByRole("heading", { name: "Aujourd'hui" }).closest("main");
    expect(readyMain?.className).toMatch(/gap-\[var\(--space-section\)\]/);
  });

  it("ready: shows due cards grouped by course", async () => {
    stubFetch({ ...emptyView, dueCards: [{ documentId: "doc-1", documentTitle: "Maths", colour: "#F87171", count: 3 }] });
    renderScreen();
    await screen.findByText("Maths");
    expect(screen.getByText(/3/)).toBeInTheDocument();
  });

  it("ready: shows notions below target grouped by course", async () => {
    stubFetch({ ...emptyView, notionsBelowTarget: [{ documentId: "doc-1", documentTitle: "Histoire", colour: "#60A5FA", count: 2 }] });
    renderScreen();
    await screen.findByText("Histoire");
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText(/notions? à consolider avant l'échéance/)).toBeInTheDocument();
  });

  it("ready: a course card's due count is the dominant number on its line — --text-display and bold, its qualifier small and muted beside it, never the same size (docs/UI.md's Type note)", async () => {
    stubFetch({ ...emptyView, dueCards: [{ documentId: "doc-1", documentTitle: "Maths", colour: "#F87171", count: 25 }] });
    renderScreen();
    await screen.findByText("Maths");

    const digit = screen.getByText("25");
    expect(digit.className).toContain("text-[length:var(--text-display)]");
    const qualifier = screen.getByText(/fiches à revoir aujourd'hui/);
    expect(qualifier.className).toContain("text-[length:var(--text-label)]");
    expect(qualifier.className).not.toContain("text-[length:var(--text-display)]");
  });

  it("ready: a course card's subject colour is a left border on the whole card, not a small dot beside the title (docs/UI.md's Subject colours note)", async () => {
    stubFetch({ ...emptyView, dueCards: [{ documentId: "doc-1", documentTitle: "Maths", colour: "#F87171", count: 3 }] });
    renderScreen();
    await screen.findByText("Maths");

    const card = screen.getByTestId("course-today-card");
    expect(card).toHaveStyle({ borderLeftColor: "#F87171" });
  });

  it("ready: 'Voir le cours' and 'Réviser' each pair a decorative icon with their label — the accessible name stays exactly the label (docs/UI.md's Icons note)", async () => {
    stubFetch({ ...emptyView, dueCards: [{ documentId: "doc-1", documentTitle: "Maths", colour: "#F87171", count: 3 }] });
    renderScreen();
    await screen.findByText("Maths");

    for (const name of ["Voir le cours", "Réviser"]) {
      const button = screen.getByRole("button", { name });
      const icon = button.querySelector("svg");
      expect(icon).not.toBeNull();
      expect(icon).toHaveAttribute("aria-hidden", "true");
      expect(icon).toHaveAttribute("focusable", "false");
    }
  });

  it("ready: a course reached only through an upcoming deadline carries no colour (workspace.md), so its card gets no left-border override", async () => {
    stubFetch({ ...emptyView, upcomingDeadlines: [{ documentId: "doc-1", title: "Maths", deadlineDate: "2026-03-12", deadlineLabel: "Contrôle", daysAway: 10 }] });
    renderScreen();
    await screen.findByText("Maths");

    const card = screen.getByTestId("course-today-card");
    expect(card.style.borderLeftColor).toBe("");
  });

  it("ready: a course card's title is --text-title, up from the plain body size it shared with everything else before this pass", async () => {
    stubFetch({ ...emptyView, dueCards: [{ documentId: "doc-1", documentTitle: "Maths", colour: "#F87171", count: 3 }] });
    renderScreen();
    const title = await screen.findByText("Maths");
    expect(title.className).toContain("text-[length:var(--text-title)]");
  });

  it("ready: shows upcoming deadlines as a plain fact, never a countdown widget", async () => {
    stubFetch({ ...emptyView, upcomingDeadlines: [{ documentId: "doc-1", title: "Maths", deadlineDate: "2026-03-12", deadlineLabel: "Contrôle", daysAway: 10 }] });
    renderScreen();
    await screen.findByText(/10 jours/i);
    expect(screen.queryByRole("timer")).not.toBeInTheDocument();
  });

  it("ready: a course due today and a course below target before its deadline render as one card each, not one per signal, and the two counts are worded differently", async () => {
    stubFetch({
      ...emptyView,
      dueCards: [{ documentId: "doc-1", documentTitle: "Maths", colour: "#F87171", count: 25 }],
      notionsBelowTarget: [{ documentId: "doc-1", documentTitle: "Maths", colour: "#F87171", count: 7 }],
    });
    renderScreen();
    await screen.findByText("Maths");

    expect(screen.getAllByText("Maths")).toHaveLength(1);
    // The digit and its qualifier are now separate elements (docs/UI.md's
    // Type note: the number dominates, the qualifier stays small beside
    // it), so each is asserted on its own rather than as one text run.
    expect(screen.getByText("25")).toBeInTheDocument();
    expect(screen.getByText(/fiches à revoir aujourd'hui/)).toBeInTheDocument();
    expect(screen.getByText("7")).toBeInTheDocument();
    expect(screen.getByText(/notions à consolider avant l'échéance/)).toBeInTheDocument();
  });

  it("ready: a course card offers 'Voir le cours', which opens that course", async () => {
    const onOpenCourse = vi.fn();
    stubFetch({ ...emptyView, notionsBelowTarget: [{ documentId: "doc-1", documentTitle: "Histoire", colour: "#60A5FA", count: 2 }] });
    const user = userEvent.setup();
    renderScreen({ onOpenCourse });
    await screen.findByText("Histoire");

    await user.click(screen.getByRole("button", { name: "Voir le cours" }));

    expect(onOpenCourse).toHaveBeenCalledWith("doc-1");
  });

  it("ready: a course card offers 'Réviser' only when something is due today", async () => {
    const onReviewCourse = vi.fn();
    stubFetch({
      ...emptyView,
      dueCards: [{ documentId: "doc-1", documentTitle: "Maths", colour: "#F87171", count: 3 }],
      notionsBelowTarget: [{ documentId: "doc-2", documentTitle: "Histoire", colour: "#60A5FA", count: 2 }],
    });
    const user = userEvent.setup();
    renderScreen({ onReviewCourse });
    const mathsCard = (await screen.findByText("Maths")).closest('[data-testid="course-today-card"]') as HTMLElement;
    const histoireCard = screen.getByText("Histoire").closest('[data-testid="course-today-card"]') as HTMLElement;

    expect(within(mathsCard).getByRole("button", { name: "Réviser" })).toBeInTheDocument();
    expect(within(histoireCard).queryByRole("button", { name: "Réviser" })).not.toBeInTheDocument();

    await user.click(within(mathsCard).getByRole("button", { name: "Réviser" }));
    expect(onReviewCourse).toHaveBeenCalledWith("doc-1");
  });

  it("ready: 'Réviser' is the card's one --accent action, 'Voir le cours' stays --secondary — even on a card where 'Voir le cours' is the only button (docs/UI.md's Colour note)", async () => {
    stubFetch({
      ...emptyView,
      dueCards: [{ documentId: "doc-1", documentTitle: "Maths", colour: "#F87171", count: 3 }],
      notionsBelowTarget: [{ documentId: "doc-2", documentTitle: "Histoire", colour: "#60A5FA", count: 2 }],
    });
    renderScreen();
    const mathsCard = (await screen.findByText("Maths")).closest('[data-testid="course-today-card"]') as HTMLElement;
    const histoireCard = screen.getByText("Histoire").closest('[data-testid="course-today-card"]') as HTMLElement;

    const reviser = within(mathsCard).getByRole("button", { name: "Réviser" });
    expect(reviser.className).toMatch(/bg-accent/);
    expect(reviser.className).toMatch(/text-white/);

    const voirMaths = within(mathsCard).getByRole("button", { name: "Voir le cours" });
    expect(voirMaths.className).not.toMatch(/bg-accent/);
    expect(voirMaths.className).toMatch(/border-border/);

    // Histoire has no due count, so no Réviser at all — its lone remaining
    // button must not be promoted to accent just because it is now alone.
    const voirHistoire = within(histoireCard).getByRole("button", { name: "Voir le cours" });
    expect(voirHistoire.className).not.toMatch(/bg-accent/);
    expect(voirHistoire.className).toMatch(/border-border/);

    // Never more than one accent element inside a single card (docs/UI.md).
    expect(within(mathsCard).getAllByRole("button").filter((b) => /bg-accent/.test(b.className))).toHaveLength(1);
  });

  it("ready: the accent action's colour is fixed — never the course's own subject colour, whatever that colour is (docs/UI.md's Colour note: --accent belongs to the app, never to a course)", async () => {
    stubFetch({
      ...emptyView,
      dueCards: [
        { documentId: "doc-1", documentTitle: "Maths", colour: "#F87171", count: 3 },
        { documentId: "doc-2", documentTitle: "Histoire", colour: "#38BDF8", count: 1 },
      ],
    });
    renderScreen();
    const mathsCard = (await screen.findByText("Maths")).closest('[data-testid="course-today-card"]') as HTMLElement;
    const histoireCard = screen.getByText("Histoire").closest('[data-testid="course-today-card"]') as HTMLElement;

    const mathsReviser = within(mathsCard).getByRole("button", { name: "Réviser" });
    const histoireReviser = within(histoireCard).getByRole("button", { name: "Réviser" });

    // Same fixed class on both, regardless of each card's own distinct
    // subject colour — the button's style never reads from card.colour.
    expect(mathsReviser.className).toMatch(/bg-accent/);
    expect(histoireReviser.className).toMatch(/bg-accent/);
    expect(mathsReviser.style.backgroundColor).toBe("");
    expect(histoireReviser.style.backgroundColor).toBe("");
  });

  it("ready: course cards and the todos card share one grid — two columns wide, items stretched to the row's own height (docs/UI.md's Grid and spacing note, reversed from this pass's earlier items-start)", async () => {
    // No accessible role or label distinguishes a grid from a stack, or
    // items-stretch from items-start (docs/TESTING.md's exception for
    // genuinely inaccessible structure): the one place in this file that
    // asserts on a class name.
    stubFetch({
      ...emptyView,
      dueCards: [{ documentId: "doc-1", documentTitle: "Maths", colour: "#F87171", count: 3 }],
      todos: [{ id: "t1", label: "x", dueDate: null, documentId: null, done: false, source: "manual", createdAt: "2026-03-01T00:00:00.000Z" }],
    });
    renderScreen();
    await screen.findByText("Maths");

    const grid = screen.getByTestId("content-grid");
    expect(grid.className).toMatch(/\bgrid\b/);
    expect(grid.className).toMatch(/items-stretch/);
    expect(grid.className).not.toMatch(/items-start/);
    expect(grid.className).not.toMatch(/flex-col/);
    // Cards are distinct blocks within one section (docs/UI.md's Grid and
    // spacing note): the grid's own gutter is --space-block, not a bare gap-4.
    expect(grid.className).toMatch(/gap-\[var\(--space-block\)\]/);

    const courseCard = screen.getByTestId("course-today-card");
    const todosCard = screen.getByTestId("todos-card");
    expect(grid).toContainElement(courseCard);
    expect(grid).toContainElement(todosCard);
  });

  it("ready: a course card's action row is pushed to the card's own bottom edge (mt-auto) — what keeps items-stretch from leaving it floating over a gap on a short card (docs/UI.md's Grid and spacing note)", async () => {
    stubFetch({ ...emptyView, dueCards: [{ documentId: "doc-1", documentTitle: "Maths", colour: "#F87171", count: 3 }] });
    renderScreen();
    await screen.findByText("Maths");

    const reviser = screen.getByRole("button", { name: "Réviser" });
    const actionRow = reviser.closest("div");
    expect(actionRow?.className).toMatch(/mt-auto/);
  });

  it("ready: course cards are sorted by urgency, nearest deadline first, no-deadline courses last (docs/UI.md's Aujourd'hui note)", async () => {
    stubFetch({
      ...emptyView,
      dueCards: [
        { documentId: "doc-1", documentTitle: "Maths", colour: "#F87171", count: 3 },
        { documentId: "doc-2", documentTitle: "Histoire", colour: "#60A5FA", count: 1 },
        { documentId: "doc-3", documentTitle: "SVT", colour: "#109DA0", count: 2 },
      ],
      upcomingDeadlines: [
        { documentId: "doc-1", title: "Maths", deadlineDate: "2026-03-12", deadlineLabel: "Contrôle", daysAway: 10 },
        { documentId: "doc-2", title: "Histoire", deadlineDate: "2026-03-04", deadlineLabel: "Contrôle", daysAway: 2 },
        // doc-3 (SVT) has no deadline at all — must sort last, after every
        // course that has one, however far out.
      ],
    });
    renderScreen();
    await screen.findByText("Maths");

    const cards = screen.getAllByTestId("course-today-card");
    const titles = cards.map((card) => within(card).getByRole("heading").textContent);
    expect(titles).toEqual(["Histoire", "Maths", "SVT"]);
  });

  it("ready: courses tied on urgency (same daysAway, or no deadline at all) keep their original order — a stable sort, not a coincidental one", async () => {
    stubFetch({
      ...emptyView,
      dueCards: [
        { documentId: "doc-1", documentTitle: "Maths", colour: "#F87171", count: 3 },
        { documentId: "doc-2", documentTitle: "Histoire", colour: "#60A5FA", count: 1 },
      ],
      // Neither has a deadline: both compare equal (Infinity), so a stable
      // sort must leave them in buildCourseCards's own original order.
    });
    renderScreen();
    await screen.findByText("Maths");

    const cards = screen.getAllByTestId("course-today-card");
    const titles = cards.map((card) => within(card).getByRole("heading").textContent);
    expect(titles).toEqual(["Maths", "Histoire"]);
  });

  it("ready: the todos card always occupies exactly one grid column, the same footprint as a course card — no longer widened to fill a stranded row (docs/UI.md's Grid and spacing note, reversed from an earlier version of this pass)", async () => {
    // Even course-card count: previously the trigger for lg:col-span-2.
    // Also a class-name assertion, same exception as the grid-sharing test
    // above: a missing col-span has no accessible trace, it is the point.
    stubFetch({
      ...emptyView,
      dueCards: [{ documentId: "doc-1", documentTitle: "Maths", colour: "#F87171", count: 3 }],
      notionsBelowTarget: [{ documentId: "doc-2", documentTitle: "Histoire", colour: "#60A5FA", count: 2 }],
    });
    renderScreen();
    await screen.findByText("Maths");
    await screen.findByText("Histoire");

    expect(screen.getByTestId("todos-card").className).not.toMatch(/col-span/);
  });

  it("ready: the todos card stays single-column on an odd course-card count too — unconditional now, not a special case", async () => {
    stubFetch({ ...emptyView, dueCards: [{ documentId: "doc-1", documentTitle: "Maths", colour: "#F87171", count: 3 }] });
    renderScreen();
    await screen.findByText("Maths");

    expect(screen.getByTestId("todos-card").className).not.toMatch(/col-span/);
  });

  it("ready: todo rows are separated by --space-block, not the tighter --space-related a checkbox shares with its own label inside one row (docs/UI.md's Aujourd'hui note)", async () => {
    stubFetch({
      ...emptyView,
      todos: [
        { id: "t1", label: "Un", dueDate: null, documentId: null, done: false, source: "manual", createdAt: "2026-03-01T00:00:00.000Z" },
        { id: "t2", label: "Deux", dueDate: null, documentId: null, done: false, source: "manual", createdAt: "2026-03-01T00:00:00.000Z" },
      ],
    });
    renderScreen();
    await screen.findByText("Un");

    const list = screen.getByText("Un").closest("ul");
    expect(list?.className).toMatch(/gap-\[var\(--space-block\)\]/);
  });

  it("ready: the checklist is a bounded, scrollable panel — capped in height, but every todo stays mounted and reachable, none removed from the page (docs/UI.md's Shape and depth note)", async () => {
    const todos = Array.from({ length: 12 }, (_, i) => ({
      id: `t${i}`,
      label: `Todo ${i}`,
      dueDate: null,
      documentId: null,
      done: false,
      source: "manual" as const,
      createdAt: "2026-03-01T00:00:00.000Z",
    }));
    stubFetch({ ...emptyView, todos });
    renderScreen();
    await screen.findByText("Todo 0");

    const list = screen.getByText("Todo 0").closest("ul");
    expect(list?.className).toMatch(/overflow-y-auto/);
    expect(list?.className).toMatch(/max-h-/);
    // A capped height is a viewport onto the list, not a smaller list:
    // every row stays in the document, reachable by Tab past the visible
    // fold — this is not the infinite scroll docs/UI.md's Forbidden list
    // bans, since nothing here is lazily loaded.
    expect(screen.getAllByRole("checkbox")).toHaveLength(12);
  });

  it("ready: the checklist, the add-todo trigger and the photo trigger live in one todos card, not three separate pieces (docs/UI.md)", async () => {
    stubFetch({ ...emptyView, todos: [{ id: "t1", label: "Réviser le chapitre 3", dueDate: null, documentId: null, done: false, source: "manual", createdAt: "2026-03-01T00:00:00.000Z" }] });
    renderScreen();
    await screen.findByText("Réviser le chapitre 3");

    const todosCard = screen.getByTestId("todos-card");
    expect(within(todosCard).getByRole("checkbox", { name: "Réviser le chapitre 3" })).toBeInTheDocument();
    expect(within(todosCard).getByRole("button", { name: "Ajouter un todo" })).toBeInTheDocument();
    expect(within(todosCard).getByRole("button", { name: /ajouter depuis une photo/i })).toBeInTheDocument();
  });

  it("ready: the two collapsed triggers share the same width via a single-column inline-grid, not each sized to its own label (docs/UI.md's Shape and depth note)", async () => {
    // jsdom does no real layout, so equal on-screen width can't be asserted
    // numerically here (verified live instead); this checks the mechanism
    // that produces it is actually present — the one class-name assertion
    // this test makes, same exception as the grid-stretch tests above.
    stubFetch(emptyView);
    renderScreen();
    await screen.findByText(/rien de prévu/i);

    const addTrigger = screen.getByRole("button", { name: "Ajouter un todo" });
    const photoTrigger = screen.getByRole("button", { name: /ajouter depuis une photo/i });
    const wrapper = addTrigger.parentElement;

    expect(wrapper).toBe(photoTrigger.parentElement);
    expect(wrapper?.className).toMatch(/\binline-grid\b/);
    expect(wrapper?.className).toMatch(/grid-cols-1/);
  });

  it("ready: 'Todos' is a section label, --text-label, not body text — a label, not a title (docs/UI.md's Type note)", async () => {
    stubFetch(emptyView);
    renderScreen();
    await screen.findByText(/rien de prévu/i);

    expect(screen.getByText("Todos").className).toContain("text-[length:var(--text-label)]");
  });

  it("ready: the date and course fields get design-system styling, not the raw native control (docs/UI.md)", async () => {
    stubFetch({ ...emptyView, todos: [{ id: "t1", label: "x", dueDate: null, documentId: null, done: false, source: "manual", createdAt: "2026-03-01T00:00:00.000Z" }] });
    const user = userEvent.setup();
    renderScreen();
    await screen.findByText("x");
    await openAddTodoForm(user);

    expect(screen.getByLabelText(/date/i).className).toMatch(/appearance-none/);
    expect(screen.getByLabelText(/^cours/i).className).toMatch(/appearance-none/);
  });

  it("each todo offers a discreet delete action, wired to DELETE, no confirmation dialog", async () => {
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
          new Response(
            JSON.stringify({
              ...emptyView,
              todos: [{ id: "t1", label: "Réviser le chapitre 3", dueDate: null, documentId: null, done: false, source: "manual", createdAt: "2026-03-01T00:00:00.000Z" }],
            }),
            { status: 200 },
          ),
        );
      }),
    );
    const user = userEvent.setup();
    renderScreen();
    await screen.findByText("Réviser le chapitre 3");

    await user.click(screen.getByRole("button", { name: /supprimer.*réviser le chapitre 3/i }));

    expect(calls).toEqual([{ url: "/api/todos/t1", method: "DELETE" }]);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("never shows 'Retour': this is the destination the header's own links lead to, not a place left and returned to", async () => {
    stubFetch({ ...emptyView, dueCards: [{ documentId: "doc-1", documentTitle: "Maths", colour: "#F87171", count: 1 }] });
    renderScreen();
    await screen.findByText("Maths");
    expect(screen.queryByText(/retour/i)).not.toBeInTheDocument();
  });

  it("ready: each todo has a checkbox reflecting its done state", async () => {
    stubFetch({
      ...emptyView,
      todos: [{ id: "t1", label: "Réviser le chapitre 3", dueDate: null, documentId: null, done: false, source: "manual", createdAt: "2026-03-01T00:00:00.000Z" }],
    });
    renderScreen();
    await screen.findByText("Réviser le chapitre 3");
    expect(screen.getByRole("checkbox", { name: "Réviser le chapitre 3" })).not.toBeChecked();
  });

  it("checking a todo's checkbox sends done: true for that todo, and only that one", async () => {
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
          new Response(
            JSON.stringify({
              ...emptyView,
              todos: [{ id: "t1", label: "Réviser le chapitre 3", dueDate: null, documentId: null, done: false, source: "manual", createdAt: "2026-03-01T00:00:00.000Z" }],
            }),
            { status: 200 },
          ),
        );
      }),
    );
    const user = userEvent.setup();
    renderScreen();
    await screen.findByText("Réviser le chapitre 3");

    await user.click(screen.getByRole("checkbox", { name: "Réviser le chapitre 3" }));

    expect(calls).toEqual([{ url: "/api/todos/t1", body: { done: true } }]);
  });

  it("offers a way to add todos from a planner photo, revealed behind a discreet trigger rather than a permanently open input", async () => {
    stubFetch(emptyView);
    const user = userEvent.setup();
    renderScreen();
    await screen.findByText(/rien de prévu/i);

    expect(screen.queryByLabelText(/photo de l'agenda/i)).not.toBeInTheDocument();

    await openPhotoPicker(user);

    expect(screen.getByLabelText(/photo de l'agenda/i)).toBeInTheDocument();
  });

  it("uploading a photo opens the proposals screen for the returned job", async () => {
    const onOpenProposals = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string, init?: RequestInit) => {
        if (init?.method === "POST" && typeof url === "string" && url.includes("from-photo")) {
          return Promise.resolve(new Response(JSON.stringify({ jobId: "job-1" }), { status: 202 }));
        }
        if (typeof url === "string" && url.startsWith("/api/documents")) return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
        return Promise.resolve(new Response(JSON.stringify(emptyView), { status: 200 }));
      }),
    );
    const user = userEvent.setup();
    renderScreen({ onOpenProposals });
    await screen.findByText(/rien de prévu/i);
    await openPhotoPicker(user);

    const input = screen.getByLabelText(/photo de l'agenda/i);
    const file = new File(["fake-bytes"], "agenda.jpg", { type: "image/jpeg" });
    await user.upload(input, file);

    expect(onOpenProposals).toHaveBeenCalledWith("job-1");
  });

  it("ready: a done todo is visually distinguished from a pending one", async () => {
    stubFetch({
      ...emptyView,
      todos: [
        { id: "t1", label: "Fait", dueDate: null, documentId: null, done: true, source: "manual", createdAt: "2026-03-01T00:00:00.000Z" },
        { id: "t2", label: "À faire", dueDate: null, documentId: null, done: false, source: "manual", createdAt: "2026-03-01T00:00:00.000Z" },
      ],
    });
    renderScreen();
    const done = await screen.findByText("Fait");
    const pending = await screen.findByText("À faire");
    expect(done).toHaveClass("line-through");
    expect(pending).not.toHaveClass("line-through");
  });

  it("no mascot in the ready state: this is a data-dense view (docs/UI.md)", async () => {
    stubFetch({ ...emptyView, todos: [{ id: "t1", label: "x", dueDate: null, documentId: null, done: false, source: "manual", createdAt: "2026-03-01T00:00:00.000Z" }] });
    renderScreen();
    await screen.findByText("x");
    expect(document.querySelectorAll("svg[data-testid='mascot']")).toHaveLength(0);
  });

  it("ready: offers a minimal form to add a todo by hand — label required, date and course optional, nothing else", async () => {
    stubFetch({ ...emptyView, todos: [{ id: "t1", label: "x", dueDate: null, documentId: null, done: false, source: "manual", createdAt: "2026-03-01T00:00:00.000Z" }] });
    const user = userEvent.setup();
    renderScreen();
    await screen.findByText("x");
    await openAddTodoForm(user);

    const labelInput = screen.getByLabelText(/nouveau todo/i);
    expect(labelInput).toBeRequired();
    expect(screen.getByLabelText(/date/i)).not.toBeRequired();
    expect(screen.getByLabelText(/^cours/i)).not.toBeRequired();
  });

  it("adding a todo by hand posts its label, refreshes the list and collapses the form", async () => {
    const calls: { url: string; body: unknown }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string, init?: RequestInit) => {
        if (typeof url === "string" && url.startsWith("/api/documents")) return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
        if (init?.method === "POST" && typeof url === "string" && url === "/api/todos") {
          calls.push({ url, body: JSON.parse(init.body as string) });
          return Promise.resolve(new Response(JSON.stringify({ id: "t1", label: "Réviser le chapitre 3", dueDate: null, documentId: null, done: false, source: "manual", createdAt: "2026-03-01T00:00:00.000Z" }), { status: 201 }));
        }
        return Promise.resolve(new Response(JSON.stringify(emptyView), { status: 200 }));
      }),
    );
    const user = userEvent.setup();
    renderScreen();
    await screen.findByText(/rien de prévu/i);
    await openAddTodoForm(user);

    await user.type(screen.getByLabelText(/nouveau todo/i), "Réviser le chapitre 3");
    await user.click(screen.getByRole("button", { name: "Ajouter" }));

    expect(calls).toEqual([{ url: "/api/todos", body: { label: "Réviser le chapitre 3", dueDate: null, documentId: null } }]);
    // Collapsed back behind its trigger, and the label field is gone with it.
    expect(screen.getByRole("button", { name: "Ajouter un todo" })).toBeInTheDocument();
    expect(screen.queryByLabelText(/nouveau todo/i)).not.toBeInTheDocument();
  });

  it("opening the add-todo form moves focus to the label field", async () => {
    stubFetch(emptyView);
    const user = userEvent.setup();
    renderScreen();
    await screen.findByText(/rien de prévu/i);

    await openAddTodoForm(user);

    expect(screen.getByLabelText(/nouveau todo/i)).toHaveFocus();
  });

  it("Escape closes the add-todo form without discarding a non-empty draft — reopening it shows the same values", async () => {
    stubFetch(emptyView);
    const user = userEvent.setup();
    renderScreen();
    await screen.findByText(/rien de prévu/i);
    await openAddTodoForm(user);

    await user.type(screen.getByLabelText(/nouveau todo/i), "Brouillon");
    await user.keyboard("{Escape}");

    expect(screen.queryByLabelText(/nouveau todo/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ajouter un todo" })).toBeInTheDocument();

    await openAddTodoForm(user);
    expect(screen.getByLabelText(/nouveau todo/i)).toHaveValue("Brouillon");
  });

  it("Escape closes the add-todo form directly when the label is empty — nothing to preserve", async () => {
    stubFetch(emptyView);
    const user = userEvent.setup();
    renderScreen();
    await screen.findByText(/rien de prévu/i);
    await openAddTodoForm(user);

    await user.keyboard("{Escape}");

    expect(screen.queryByLabelText(/nouveau todo/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ajouter un todo" })).toBeInTheDocument();

    await openAddTodoForm(user);
    expect(screen.getByLabelText(/nouveau todo/i)).toHaveValue("");
  });

  it("the add-todo form has a visible 'Fermer' button — Escape alone is a keyboard-only path with no on-screen equivalent (docs/UI.md's Shape and depth note)", async () => {
    stubFetch(emptyView);
    const user = userEvent.setup();
    renderScreen();
    await screen.findByText(/rien de prévu/i);
    await openAddTodoForm(user);

    expect(screen.getByRole("button", { name: "Fermer" })).toBeInTheDocument();
  });

  it("clicking 'Fermer' closes the add-todo form without discarding a non-empty draft — reopening it shows the same values, exactly like Escape", async () => {
    stubFetch(emptyView);
    const user = userEvent.setup();
    renderScreen();
    await screen.findByText(/rien de prévu/i);
    await openAddTodoForm(user);

    await user.type(screen.getByLabelText(/nouveau todo/i), "Brouillon");
    await user.click(screen.getByRole("button", { name: "Fermer" }));

    expect(screen.queryByLabelText(/nouveau todo/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ajouter un todo" })).toBeInTheDocument();

    await openAddTodoForm(user);
    expect(screen.getByLabelText(/nouveau todo/i)).toHaveValue("Brouillon");
  });

  it("the add-todo form's 'Fermer' button is reachable by Tab and activatable by keyboard, not just by mouse", async () => {
    stubFetch(emptyView);
    const user = userEvent.setup();
    renderScreen();
    await screen.findByText(/rien de prévu/i);
    await openAddTodoForm(user);

    // A label is required for "Ajouter" to be enabled at all — an empty
    // field would leave it disabled and skipped in tab order, silently
    // shifting every count below by one.
    await user.type(screen.getByLabelText(/nouveau todo/i), "Brouillon");
    await user.tab(); // date
    await user.tab(); // cours
    await user.tab(); // Ajouter (submit)
    await user.tab(); // Fermer
    expect(screen.getByRole("button", { name: "Fermer" })).toHaveFocus();

    await user.keyboard("{Enter}");
    expect(screen.queryByLabelText(/nouveau todo/i)).not.toBeInTheDocument();
  });

  it("offers a way to close the photo picker without picking a file — it had no closing mechanism at all before this pass (docs/UI.md's Shape and depth note)", async () => {
    stubFetch(emptyView);
    const user = userEvent.setup();
    renderScreen();
    await screen.findByText(/rien de prévu/i);
    await openPhotoPicker(user);

    await user.click(screen.getByRole("button", { name: "Fermer" }));

    expect(screen.queryByLabelText(/photo de l'agenda/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /ajouter depuis une photo/i })).toBeInTheDocument();
  });

  it("Escape also closes the photo picker, exactly what its visible 'Fermer' button does", async () => {
    stubFetch(emptyView);
    const user = userEvent.setup();
    renderScreen();
    await screen.findByText(/rien de prévu/i);
    await openPhotoPicker(user);

    await user.keyboard("{Escape}");

    expect(screen.queryByLabelText(/photo de l'agenda/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /ajouter depuis une photo/i })).toBeInTheDocument();
  });

  it("the photo picker's 'Fermer' button is disabled while a photo is already uploading — same guard UploadCard's own 'Annuler' applies to its confirm step", async () => {
    let resolveUpload: (() => void) | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string, init?: RequestInit) => {
        if (typeof url === "string" && url.startsWith("/api/documents")) return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
        if (init?.method === "POST" && typeof url === "string" && url.includes("from-photo")) {
          return new Promise((resolve) => {
            resolveUpload = () => resolve(new Response(JSON.stringify({ jobId: "job-1" }), { status: 202 }));
          });
        }
        return Promise.resolve(new Response(JSON.stringify(emptyView), { status: 200 }));
      }),
    );
    const user = userEvent.setup();
    renderScreen();
    await screen.findByText(/rien de prévu/i);
    await openPhotoPicker(user);

    const input = screen.getByLabelText(/photo de l'agenda/i);
    const file = new File(["fake-bytes"], "agenda.jpg", { type: "image/jpeg" });
    await user.upload(input, file);

    expect(screen.getByRole("button", { name: "Fermer" })).toBeDisabled();
    resolveUpload?.();
  });

  it("ready: a todo's due date shows on its row, discreet and placed right before the delete button — and nothing shows when it has none", async () => {
    stubFetch({
      ...emptyView,
      todos: [
        { id: "t1", label: "Avec échéance", dueDate: "2026-03-20", documentId: null, done: false, source: "manual", createdAt: "2026-03-01T00:00:00.000Z" },
        { id: "t2", label: "Sans échéance", dueDate: null, documentId: null, done: false, source: "manual", createdAt: "2026-03-01T00:00:00.000Z" },
      ],
    });
    renderScreen();
    await screen.findByText("Avec échéance");

    const datedRow = screen.getByText("Avec échéance").closest('[data-testid="todo-row"]') as HTMLElement;
    const dateText = within(datedRow).getByText(/20 mars 2026/);
    const deleteButton = within(datedRow).getByRole("button", { name: /supprimer/i });
    const rowChildren = Array.from(datedRow.children);
    expect(rowChildren.indexOf(dateText)).toBe(rowChildren.indexOf(deleteButton) - 1);

    const undatedRow = screen.getByText("Sans échéance").closest('[data-testid="todo-row"]') as HTMLElement;
    expect(within(undatedRow).queryByText(/\d/)).not.toBeInTheDocument();
    expect(within(undatedRow).queryByText("-")).not.toBeInTheDocument();
    expect(within(undatedRow).queryByText(/sans date/i)).not.toBeInTheDocument();
  });

  it("ready: a past due date renders exactly like any other date — a plain fact, no warning colour (docs/UI.md)", async () => {
    stubFetch({
      ...emptyView,
      todos: [{ id: "t1", label: "En retard", dueDate: "2020-01-05", documentId: null, done: false, source: "manual", createdAt: "2026-03-01T00:00:00.000Z" }],
    });
    renderScreen();
    await screen.findByText("En retard");

    const dateText = screen.getByText(/5 janvier 2020/);
    expect(dateText.className).not.toMatch(/warning/);
  });
});
