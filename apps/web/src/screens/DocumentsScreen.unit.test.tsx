// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import type { DocumentSummary } from "@studia/contracts";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { TodayView } from "../lib/today-api.js";
import { DocumentsScreen } from "./DocumentsScreen.js";

// Redesigned per a "Mes cours" mockup, ignoring docs/UI.md per the user: a
// persistent two-column layout — a course card per document on the left,
// the (also redesigned, always-open) UploadCard on the right, in every
// state (loading/error/empty/ready alike), not a toggle sharing a grid
// slot with the cards. Each card now shows real notions/mastered counts
// (GET /api/documents/:id/progress) and a real due-today count and
// deadline countdown (both from GET /api/today, the same shared query
// AppNav/TodayScreen already use) alongside the existing status/pageCount
// data. "Voir les notions" is gone from this screen — Notions has its own
// nav destination + picker (M9) — replaced by "Réviser", which opens a
// real review session directly (onReviewCourse), matching the accent
// action Aujourd'hui's own course cards already use.
function renderScreen(overrides: Partial<{ onOpenReader: (documentId: string) => void; onReviewCourse: (documentId: string) => void }> = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <DocumentsScreen onOpenReader={overrides.onOpenReader ?? (() => undefined)} onReviewCourse={overrides.onReviewCourse ?? (() => undefined)} />
    </QueryClientProvider>,
  );
}

const emptyToday: TodayView = { date: "2026-09-06", dueCards: [], notionsBelowTarget: [], todos: [], upcomingDeadlines: [], streak: 0 };

function stubFetch(options: {
  documents?: DocumentSummary[] | (() => Response);
  today?: TodayView;
  progress?: Record<string, { mastered: number; total: number; nextDueDate: string | null }>;
}) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation((url: string) => {
      if (typeof url === "string" && /\/api\/documents\/[^/]+\/progress/.test(url)) {
        const documentId = url.split("/")[3]!;
        const progress = options.progress?.[documentId] ?? { mastered: 0, total: 0, nextDueDate: null };
        return Promise.resolve(new Response(JSON.stringify(progress), { status: 200 }));
      }
      if (typeof url === "string" && url.startsWith("/api/today")) {
        return Promise.resolve(new Response(JSON.stringify(options.today ?? emptyToday), { status: 200 }));
      }
      if (typeof url === "string" && url.startsWith("/api/documents")) {
        if (typeof options.documents === "function") return Promise.resolve(options.documents());
        return Promise.resolve(new Response(JSON.stringify(options.documents ?? []), { status: 200 }));
      }
      return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
    }),
  );
}

const aDocument: DocumentSummary = { id: "d1", title: "Chapitre 3", sourceType: "photo", status: "done", pageCount: 3, colour: "#F87171", createdAt: "2026-01-01T00:00:00Z" };

describe("DocumentsScreen", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("loading state: shows skeleton placeholders, with the upload panel already visible on the right", () => {
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(new Promise(() => {})));

    renderScreen();

    expect(screen.getByText("Mes cours")).toBeInTheDocument();
    expect(screen.queryByText(/aucun cours/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/titre du cours/i)).toBeInTheDocument();
  });

  it("error state: shows the confused mascot and an explicit message, with a retry action — the upload panel stays usable regardless", async () => {
    stubFetch({ documents: () => new Response(null, { status: 500 }) });

    renderScreen();

    expect(await screen.findByText(/impossible de charger tes cours/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /réessayer/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/titre du cours/i)).toBeInTheDocument();
  });

  it("empty state: invites the user to add a course, the upload panel right there, never 'aucun résultat'", async () => {
    stubFetch({ documents: [] });

    renderScreen();

    expect(await screen.findByText(/prends ton cours en photo pour commencer/i)).toBeInTheDocument();
    expect(screen.getByText("Ajouter un cours")).toBeInTheDocument();
    expect(screen.queryByText(/^aucun résultat$/i)).not.toBeInTheDocument();
  });

  it("ready state: lists the user's documents with status, subject colour and page count", async () => {
    stubFetch({ documents: [aDocument] });

    renderScreen();

    expect(await screen.findByText("Chapitre 3")).toBeInTheDocument();
    expect(screen.getByText("3 pages")).toBeInTheDocument();
  });

  it("ready state: a done course shows its real notions/mastered/due counts", async () => {
    stubFetch({
      documents: [aDocument],
      today: { ...emptyToday, dueCards: [{ documentId: "d1", documentTitle: "Chapitre 3", colour: "#F87171", count: 12 }] },
      progress: { d1: { mastered: 15, total: 24, nextDueDate: null } },
    });

    renderScreen();
    const card = await screen.findByTestId("document-card");

    expect(await within(card).findByText(/24 notions/)).toBeInTheDocument();
    expect(within(card).getByText(/15 maîtrisées/)).toBeInTheDocument();
    expect(within(card).getByText(/12 à réviser/)).toBeInTheDocument();
  });

  it("ready state: a course with a real deadline shows the relative countdown badge", async () => {
    stubFetch({
      documents: [aDocument],
      today: { ...emptyToday, upcomingDeadlines: [{ documentId: "d1", title: "Chapitre 3", deadlineDate: "2026-09-14", deadlineLabel: null, daysAway: 8 }] },
    });

    renderScreen();

    expect(await screen.findByText("Examen dans 8 jours")).toBeInTheDocument();
  });

  it("ready state: a course with nothing due shows a disabled 'Rien à réviser' instead of the accent action", async () => {
    stubFetch({ documents: [aDocument], progress: { d1: { mastered: 13, total: 16, nextDueDate: null } } });

    renderScreen();
    await screen.findByText("Chapitre 3");

    expect(screen.getByRole("button", { name: "Rien à réviser" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Réviser" })).not.toBeInTheDocument();
  });

  it("a course with something due offers 'Réviser', calling back with its id — the real review session, not just the notions list", async () => {
    const user = userEvent.setup();
    const onReviewCourse = vi.fn();
    stubFetch({
      documents: [aDocument],
      today: { ...emptyToday, dueCards: [{ documentId: "d1", documentTitle: "Chapitre 3", colour: "#F87171", count: 3 }] },
    });

    renderScreen({ onReviewCourse });
    await screen.findByText("Chapitre 3");

    await user.click(screen.getByRole("button", { name: "Réviser" }));

    expect(onReviewCourse).toHaveBeenCalledWith("d1");
  });

  it("a done document offers to open the reader, calling back with its id", async () => {
    const user = userEvent.setup();
    const onOpenReader = vi.fn();
    stubFetch({ documents: [aDocument] });

    renderScreen({ onOpenReader });
    await screen.findByText("Chapitre 3");

    await user.click(screen.getByRole("button", { name: /lire le cours/i }));

    expect(onOpenReader).toHaveBeenCalledWith("d1");
  });

  it("shows a retry action only for a failed document, with its last error implied by the failed status", async () => {
    const failed: DocumentSummary = { ...aDocument, id: "d2", title: "Cours raté", status: "failed" };
    stubFetch({ documents: [failed] });

    renderScreen();

    await screen.findByText("Cours raté");
    expect(screen.getByText("Échec")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /réessayer/i })).toBeInTheDocument();
  });

  it("a card's own 'Lire le cours', 'Réviser' and 'Réessayer' each pair a decorative icon with their label — the accessible name stays exactly the label (docs/UI.md's Icons note)", async () => {
    const failed: DocumentSummary = { ...aDocument, id: "d2", title: "Cours raté", status: "failed" };
    stubFetch({
      documents: [aDocument, failed],
      today: { ...emptyToday, dueCards: [{ documentId: "d1", documentTitle: "Chapitre 3", colour: "#F87171", count: 3 }] },
    });

    renderScreen();
    await screen.findByText("Chapitre 3");
    await screen.findByText("Cours raté");

    for (const name of ["Lire le cours", "Réviser", "Réessayer"]) {
      const button = screen.getByRole("button", { name });
      const icon = button.querySelector("svg");
      expect(icon).not.toBeNull();
      expect(icon).toHaveAttribute("aria-hidden", "true");
      expect(icon).toHaveAttribute("focusable", "false");
    }
  });

  it("offers a way to delete a course via a trash icon, its accessible name still naming the course, refreshing the list", async () => {
    const user = userEvent.setup();
    const calls: { url: string; method: string | undefined }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string, init?: RequestInit) => {
        if (init?.method === "DELETE") {
          calls.push({ url, method: init.method });
          return Promise.resolve(new Response(null, { status: 204 }));
        }
        if (typeof url === "string" && /\/api\/documents\/[^/]+\/progress/.test(url)) return Promise.resolve(new Response(JSON.stringify({ mastered: 0, total: 0, nextDueDate: null }), { status: 200 }));
        if (typeof url === "string" && url.startsWith("/api/today")) return Promise.resolve(new Response(JSON.stringify(emptyToday), { status: 200 }));
        return Promise.resolve(new Response(JSON.stringify([aDocument]), { status: 200 }));
      }),
    );

    renderScreen();
    await screen.findByText("Chapitre 3");

    const deleteButton = screen.getByRole("button", { name: /supprimer.*chapitre 3/i });
    expect(deleteButton.querySelector("svg")).not.toBeNull();
    await user.click(deleteButton);

    expect(calls).toContainEqual({ url: "/api/documents/d1", method: "DELETE" });
  });

  it("the notions/mastered/due line has a leading icon", async () => {
    stubFetch({ documents: [aDocument], progress: { d1: { mastered: 15, total: 24, nextDueDate: null } } });

    renderScreen();
    const card = await screen.findByTestId("document-card");
    await within(card).findByText(/24 notions/);

    expect(within(card).getByTestId("course-stats").querySelector("svg")).not.toBeNull();
  });

  // M10 Phase 1's per-screen backlog: this button was h-8 w-8 (32px), no
  // responsive variant, under docs/UI.md's 44px minimum. Same fix
  // Aujourd'hui's own pass already established (EXPAND_TAP_TARGET_44,
  // apps/web/src/lib/tap-target.ts) — a relative/isolate positioning
  // context plus an absolutely centred, negative-z before-pseudo-element,
  // leaving the visible box untouched. jsdom computes no real layout, so
  // there is no behaviour left to assert beyond "the classes that produce
  // this are actually on the rendered element" (docs/UI.md's own class-
  // name-assertion exception) — whether a click just outside the visible
  // box still reaches it is a real behaviour instead, checked for real in
  // e2e/documents-mobile.spec.ts against an actual browser layout.
  it("the delete button carries the 44px expanded tap-target pattern, with its own visible box unchanged", async () => {
    stubFetch({ documents: [aDocument] });

    renderScreen();
    await screen.findByText("Chapitre 3");

    const deleteButton = screen.getByRole("button", { name: /supprimer.*chapitre 3/i });
    expect(deleteButton.className).toMatch(/h-8 w-8/);
    expect(deleteButton.className).toMatch(/before:h-11/);
    expect(deleteButton.className).toMatch(/before:w-11/);
    expect(deleteButton.className).toMatch(/before:-z-10/);
    expect(deleteButton.className).toMatch(/isolate/);
  });

  it("polls while a document is still pending or running", async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (typeof url === "string" && url.startsWith("/api/today")) return Promise.resolve(new Response(JSON.stringify(emptyToday), { status: 200 }));
      return Promise.resolve(new Response(JSON.stringify([{ ...aDocument, status: "pending" }]), { status: 200 }));
    });
    vi.stubGlobal("fetch", fetchMock);

    renderScreen();

    await screen.findByText("En attente");
    const initialCalls = fetchMock.mock.calls.length;
    await waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThan(initialCalls), { timeout: 4000 });
  });
});
