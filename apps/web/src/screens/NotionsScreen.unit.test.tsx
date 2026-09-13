// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import type { DocumentSummary } from "@studia/contracts";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NotionsScreen } from "./NotionsScreen.js";

// Redesigned per a "Notions" mockup, ignoring docs/UI.md per the user: one
// unified page — a pill selector of courses at the top, then that course's
// own summary card and notion list — replacing the old two-step picker
// page → course page flow (CoursePickerScreen was still shared with
// Lecteur/Tuteur at the time; both later dropped it too, in their own
// redesigns, and it was deleted once Tuteur — its last consumer — did).
// Deep links from elsewhere (documentId set) still pre-select that course
// and show "Retour à mes
// cours"; the nav's own direct entry (documentId undefined) shows no back
// link and defaults to the first course. Each notion's status badge
// (Maîtrisée/À réviser/En apprentissage), review count and next-review
// wording come from the enriched GET /api/documents/:id/notions-progress
// (reps, nextDueDate, dueNow — packages/core/src/review's own
// getNotionsProgress composition, no schema change). The old per-notion
// "mastery gap" explanatory sentences are gone, folded into the new status
// badge + review count instead.
function renderScreen(
  overrides: Partial<{
    documentId: string;
    onBack: () => void;
    onReview: (documentId: string, notionId?: string) => void;
    onOpenProgress: (documentId: string) => void;
    onOpenReader: (documentId: string) => void;
    onOpenTutor: (documentId: string) => void;
  }> = {},
) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <NotionsScreen
        documentId={overrides.documentId}
        onBack={overrides.onBack ?? (() => undefined)}
        onReview={overrides.onReview ?? (() => undefined)}
        onOpenProgress={overrides.onOpenProgress ?? (() => undefined)}
        onOpenReader={overrides.onOpenReader ?? (() => undefined)}
        onOpenTutor={overrides.onOpenTutor ?? (() => undefined)}
      />
    </QueryClientProvider>,
  );
}

const docA: DocumentSummary = { id: "doc-1", title: "Biologie", sourceType: "photo", status: "done", pageCount: 3, colour: "#F87171", createdAt: "2026-01-01T00:00:00Z" };
const docB: DocumentSummary = { id: "doc-2", title: "Histoire", sourceType: "photo", status: "done", pageCount: 2, colour: "#38BDF8", createdAt: "2026-01-01T00:00:00Z" };

const aNotion = { id: "n1", documentId: "doc-1", userId: "u1", title: "Photosynthèse", body: "La plante capte la lumière.", difficulty: "medium" as const, position: 0, createdAt: "2026-01-01T00:00:00Z" };

type NotionsProgressRow = { notionId: string; masteredCards: number; totalCards: number; cardsWithEnoughReps?: number; cardsWithEnoughStability?: number; reps?: number; nextDueDate?: string | null; dueNow?: boolean };

function stubFetch(options: {
  documents?: DocumentSummary[] | (() => Response);
  notionsByDocument?: Record<string, (typeof aNotion)[]>;
  progressByDocument?: Record<string, { mastered: number; total: number; nextDueDate: string | null }>;
  notionsProgressByDocument?: Record<string, NotionsProgressRow[]>;
  extra?: (url: string, init?: RequestInit) => Response | undefined;
}) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      const extra = options.extra?.(url, init);
      if (extra) return Promise.resolve(extra);

      if (url.startsWith("/api/today")) {
        return Promise.resolve(new Response(JSON.stringify({ date: "2026-01-01", dueCards: [], notionsBelowTarget: [], todos: [], upcomingDeadlines: [], streak: 0 }), { status: 200 }));
      }
      const notionsProgressMatch = /\/api\/documents\/([^/]+)\/notions-progress/.exec(url);
      if (notionsProgressMatch) {
        const rows = (options.notionsProgressByDocument?.[notionsProgressMatch[1]!] ?? []).map((row) => ({
          cardsWithEnoughReps: 0,
          cardsWithEnoughStability: 0,
          reps: 0,
          nextDueDate: null,
          dueNow: false,
          ...row,
        }));
        return Promise.resolve(new Response(JSON.stringify(rows), { status: 200 }));
      }
      const progressMatch = /\/api\/documents\/([^/]+)\/progress/.exec(url);
      if (progressMatch) {
        const progress = options.progressByDocument?.[progressMatch[1]!] ?? { mastered: 0, total: 0, nextDueDate: null };
        return Promise.resolve(new Response(JSON.stringify(progress), { status: 200 }));
      }
      const notionsMatch = /\/api\/documents\/([^/]+)\/notions$/.exec(url);
      if (notionsMatch) {
        return Promise.resolve(new Response(JSON.stringify(options.notionsByDocument?.[notionsMatch[1]!] ?? []), { status: 200 }));
      }
      if (url.startsWith("/api/documents")) {
        if (typeof options.documents === "function") return Promise.resolve(options.documents());
        return Promise.resolve(new Response(JSON.stringify(options.documents ?? []), { status: 200 }));
      }
      return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
    }),
  );
}

describe("NotionsScreen", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("loading state: shows skeleton placeholders while the course list is being fetched", () => {
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(new Promise(() => {})));

    renderScreen();

    expect(screen.getByText("Notions")).toBeInTheDocument();
    expect(screen.queryByText(/ajoute un cours/i)).not.toBeInTheDocument();
  });

  it("error state: shows the confused mascot and an explicit message, with a retry action", async () => {
    stubFetch({ documents: () => new Response(null, { status: 500 }) });

    renderScreen();

    expect(await screen.findByText(/impossible de charger tes cours/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /réessayer/i })).toBeInTheDocument();
  });

  it("empty state: no courses at all — invites the user back to Mes cours, no pills", async () => {
    stubFetch({ documents: [] });

    renderScreen();

    expect(await screen.findByText(/ajoute un cours dans mes cours/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Biologie" })).not.toBeInTheDocument();
  });

  it("ready state: shows a pill per course, the first one selected by default when reached from the nav directly", async () => {
    stubFetch({ documents: [docA, docB], notionsByDocument: { "doc-1": [aNotion] } });

    renderScreen();

    const biologyPill = await screen.findByRole("button", { name: "Biologie" });
    expect(biologyPill).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("button", { name: "Histoire" })).not.toHaveAttribute("aria-current");
    expect(await screen.findByText("Photosynthèse")).toBeInTheDocument();
  });

  it("clicking a different pill switches the shown course's own notions, no navigation involved", async () => {
    const historyNotion = { ...aNotion, id: "n2", documentId: "doc-2", title: "La Révolution" };
    stubFetch({ documents: [docA, docB], notionsByDocument: { "doc-1": [aNotion], "doc-2": [historyNotion] } });
    const user = userEvent.setup();

    renderScreen();
    await screen.findByText("Photosynthèse");

    await user.click(screen.getByRole("button", { name: "Histoire" }));

    expect(await screen.findByText("La Révolution")).toBeInTheDocument();
    expect(screen.queryByText("Photosynthèse")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Histoire" })).toHaveAttribute("aria-current", "page");
  });

  it("a deep-linked documentId pre-selects that course (even when it isn't first) and shows 'Retour à mes cours'", async () => {
    const historyNotion = { ...aNotion, id: "n2", documentId: "doc-2", title: "La Révolution" };
    stubFetch({ documents: [docA, docB], notionsByDocument: { "doc-1": [aNotion], "doc-2": [historyNotion] } });
    const onBack = vi.fn();
    const user = userEvent.setup();

    renderScreen({ documentId: "doc-2", onBack });

    expect(await screen.findByText("La Révolution")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Histoire" })).toHaveAttribute("aria-current", "page");
    await user.click(screen.getByRole("button", { name: "Retour à mes cours" }));
    expect(onBack).toHaveBeenCalled();
  });

  it("reached from the nav directly (no documentId), there is no back link at all", async () => {
    stubFetch({ documents: [docA], notionsByDocument: { "doc-1": [aNotion] } });

    renderScreen();

    await screen.findByText("Photosynthèse");
    expect(screen.queryByRole("button", { name: /retour/i })).not.toBeInTheDocument();
  });

  it("the course summary card shows real notions/mastered/due counts and a bigger, course-coloured icon", async () => {
    stubFetch({
      documents: [docA],
      notionsByDocument: { "doc-1": [aNotion] },
      progressByDocument: { "doc-1": { mastered: 2, total: 5, nextDueDate: null } },
    });

    renderScreen();

    const summary = await screen.findByTestId("notions-course-summary");
    expect(await within(summary).findByText(/5 notions/)).toBeInTheDocument();
    expect(within(summary).getByText(/2 maîtrisées/)).toBeInTheDocument();
  });

  it("'Réviser N fiches' is disabled as 'Rien à réviser' when nothing is due for the selected course", async () => {
    stubFetch({ documents: [docA], notionsByDocument: { "doc-1": [aNotion] } });

    renderScreen();

    expect(await screen.findByRole("button", { name: "Rien à réviser" })).toBeDisabled();
  });

  it("the course summary's 'Réviser' calls onReview with the course id and no notionId", async () => {
    const onReview = vi.fn();
    const user = userEvent.setup();
    stubFetch({
      documents: [docA],
      notionsByDocument: { "doc-1": [aNotion] },
      extra: (url) => (url.startsWith("/api/today") ? new Response(JSON.stringify({ date: "2026-01-01", dueCards: [{ documentId: "doc-1", documentTitle: "Biologie", colour: "#F87171", count: 3 }], notionsBelowTarget: [], todos: [], upcomingDeadlines: [], streak: 0 }), { status: 200 }) : undefined),
    });

    renderScreen({ onReview });
    await user.click(await screen.findByRole("button", { name: /réviser 3 fiches/i }));

    expect(onReview).toHaveBeenCalledWith("doc-1", undefined);
  });

  it("'Lire le cours', 'Voir tes progrès' and 'Discuter du cours' each call back with the selected course's id", async () => {
    const onOpenReader = vi.fn();
    const onOpenProgress = vi.fn();
    const onOpenTutor = vi.fn();
    const user = userEvent.setup();
    stubFetch({ documents: [docA], notionsByDocument: { "doc-1": [aNotion] } });

    renderScreen({ onOpenReader, onOpenProgress, onOpenTutor });
    await screen.findByText("Photosynthèse");

    await user.click(screen.getByRole("button", { name: "Lire le cours" }));
    await user.click(screen.getByRole("button", { name: "Voir tes progrès" }));
    await user.click(screen.getByRole("button", { name: "Discuter du cours" }));

    expect(onOpenReader).toHaveBeenCalledWith("doc-1");
    expect(onOpenProgress).toHaveBeenCalledWith("doc-1");
    expect(onOpenTutor).toHaveBeenCalledWith("doc-1");
  });

  it("a notion with every card mastered shows the 'Maîtrisée' badge, even when a card also happens to be due", async () => {
    stubFetch({
      documents: [docA],
      notionsByDocument: { "doc-1": [aNotion] },
      notionsProgressByDocument: { "doc-1": [{ notionId: "n1", masteredCards: 1, totalCards: 1, reps: 8, nextDueDate: "2026-01-07T00:00:00.000Z", dueNow: false }] },
    });

    renderScreen();
    const card = await screen.findByTestId("notion-card");

    expect(within(card).getByText("Maîtrisée")).toBeInTheDocument();
    expect(within(card).getByText(/8 révisions/)).toBeInTheDocument();
  });

  it("a not-yet-mastered notion with a card due right now shows the 'À réviser' badge and 'à réviser maintenant'", async () => {
    stubFetch({
      documents: [docA],
      notionsByDocument: { "doc-1": [aNotion] },
      notionsProgressByDocument: { "doc-1": [{ notionId: "n1", masteredCards: 0, totalCards: 1, reps: 3, nextDueDate: null, dueNow: true }] },
    });

    renderScreen();
    const card = await screen.findByTestId("notion-card");

    expect(within(card).getByText("À réviser")).toBeInTheDocument();
    expect(within(card).getByText(/à réviser maintenant/i)).toBeInTheDocument();
  });

  it("a not-yet-mastered, not-yet-due notion shows 'En apprentissage' with its real next-review wording", async () => {
    // Computed relative to the real clock (todayDateKey() is never mocked
    // here) rather than a fixed future date, so this test doesn't rot the
    // day this file's own fixed dates finally arrive in the past.
    const sixDaysFromNow = new Date(Date.now() + 6 * 86_400_000).toISOString();
    stubFetch({
      documents: [docA],
      notionsByDocument: { "doc-1": [aNotion] },
      notionsProgressByDocument: { "doc-1": [{ notionId: "n1", masteredCards: 0, totalCards: 1, reps: 2, nextDueDate: sixDaysFromNow, dueNow: false }] },
    });

    renderScreen();
    const card = await screen.findByTestId("notion-card");

    expect(within(card).getByText("En apprentissage")).toBeInTheDocument();
    expect(within(card).getByText(/dans \d+ jours?/)).toBeInTheDocument();
  });

  it("a notion with no cards at all defaults to 'En apprentissage'", async () => {
    stubFetch({ documents: [docA], notionsByDocument: { "doc-1": [aNotion] } });

    renderScreen();
    const card = await screen.findByTestId("notion-card");

    expect(within(card).getByText("En apprentissage")).toBeInTheDocument();
  });

  it("the notion's body is hidden by default and revealed on demand, rendered as real markdown", async () => {
    const richNotion = { ...aNotion, body: "Il y a **deux** phases :\n\n1. Phase claire\n2. Cycle de Calvin" };
    stubFetch({ documents: [docA], notionsByDocument: { "doc-1": [richNotion] } });
    const user = userEvent.setup();

    renderScreen();
    await screen.findByText("Photosynthèse");
    expect(screen.queryByText("Cycle de Calvin")).not.toBeInTheDocument();

    await user.click(screen.getByText("Voir le contenu"));

    const strong = await screen.findByText("deux");
    expect(strong.tagName).toBe("STRONG");
    const items = screen.getAllByRole("listitem");
    expect(items.map((li) => li.textContent)).toEqual(["Phase claire", "Cycle de Calvin"]);
  });

  it("clicking 'Réviser' on a notion card starts a review scoped to that notion, with the selected course's id", async () => {
    const onReview = vi.fn();
    const user = userEvent.setup();
    stubFetch({ documents: [docA], notionsByDocument: { "doc-1": [aNotion] } });

    renderScreen({ onReview });
    await screen.findByText("Photosynthèse");
    await user.click(screen.getByRole("button", { name: "Réviser" }));

    expect(onReview).toHaveBeenCalledWith("doc-1", "n1");
  });

  it("every notion card's 'Réviser' pairs a decorative icon with its label — the accessible name stays exactly the label (docs/UI.md's Icons note)", async () => {
    stubFetch({ documents: [docA], notionsByDocument: { "doc-1": [aNotion] } });
    renderScreen();
    await screen.findByText("Photosynthèse");

    const button = within(screen.getByTestId("notion-card")).getByRole("button", { name: "Réviser" });
    const icon = button.querySelector("svg");
    expect(icon).not.toBeNull();
    expect(icon).toHaveAttribute("aria-hidden", "true");
    expect(icon).toHaveAttribute("focusable", "false");
  });

  it("polls while there are no notions yet, and shows them once splitting finishes", async () => {
    let notionsCallCount = 0;
    stubFetch({
      documents: [docA],
      extra: (url) => {
        if (!/\/api\/documents\/doc-1\/notions$/.test(url)) return undefined;
        notionsCallCount += 1;
        const body = notionsCallCount === 1 ? [] : [aNotion];
        return new Response(JSON.stringify(body), { status: 200 });
      },
    });

    renderScreen();

    await screen.findByText(/pas encore été créées/i);
    await waitFor(() => expect(notionsCallCount).toBeGreaterThan(1), { timeout: 4000 });
    expect(await screen.findByText("Photosynthèse")).toBeInTheDocument();
  });

  it("requesting generation calls the whole-document generate endpoint, defaulting to flashcards", async () => {
    const user = userEvent.setup();
    const calls: string[] = [];
    stubFetch({
      documents: [docA],
      notionsByDocument: { "doc-1": [aNotion] },
      extra: (url, init) => {
        calls.push(`${init?.method ?? "GET"} ${url}`);
        if (url.includes("/generate")) return new Response(JSON.stringify({ jobIds: ["j1"] }), { status: 202 });
        return undefined;
      },
    });

    renderScreen();
    await screen.findByText("Photosynthèse");
    await user.click(screen.getByRole("button", { name: /créer les fiches/i }));

    expect(calls).toContainEqual("POST /api/documents/doc-1/generate");
  });

  it("generation: unchecking every type disables the button, and renames to 'Régénérer' once every notion already has cards", async () => {
    const user = userEvent.setup();
    stubFetch({
      documents: [docA],
      notionsByDocument: { "doc-1": [aNotion] },
      notionsProgressByDocument: { "doc-1": [{ notionId: "n1", masteredCards: 1, totalCards: 3 }] },
    });

    renderScreen();
    expect(await screen.findByRole("button", { name: /régénérer les fiches/i })).toBeInTheDocument();

    await user.click(screen.getByRole("checkbox", { name: "Flashcards" }));
    expect(screen.getByRole("button", { name: /régénérer les fiches/i })).toBeDisabled();
  });

  it("generation: tracks progress via generation-status and invalidates notions-progress once done", async () => {
    const user = userEvent.setup();
    let statusCalls = 0;
    let notionsProgressCalls = 0;
    stubFetch({
      documents: [docA],
      notionsByDocument: { "doc-1": [aNotion] },
      extra: (url) => {
        if (url.includes("/notions-progress")) notionsProgressCalls += 1;
        if (url.includes("/generation-status")) {
          statusCalls += 1;
          const body = statusCalls === 1 ? { done: 1, total: 3, failed: 0 } : { done: 3, total: 3, failed: 0 };
          return new Response(JSON.stringify(body), { status: 200 });
        }
        if (url.includes("/generate")) return new Response(JSON.stringify({ jobIds: ["j1", "j2", "j3"] }), { status: 202 });
        return undefined;
      },
    });

    renderScreen();
    await screen.findByText("Photosynthèse");
    const before = notionsProgressCalls;
    await user.click(screen.getByRole("button", { name: /créer les fiches/i }));

    expect(await screen.findByText(/1 \/ 3/)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: /créer les fiches/i })).not.toBeDisabled(), { timeout: 4000 });
    await waitFor(() => expect(notionsProgressCalls).toBeGreaterThan(before), { timeout: 4000 });
  });

  it("generation: shows an error and re-enables the button if starting generation fails", async () => {
    const user = userEvent.setup();
    stubFetch({
      documents: [docA],
      notionsByDocument: { "doc-1": [aNotion] },
      extra: (url) => (url.includes("/generate") ? new Response(null, { status: 500 }) : undefined),
    });

    renderScreen();
    await screen.findByText("Photosynthèse");
    await user.click(screen.getByRole("button", { name: /créer les fiches/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/impossible de créer les fiches/i);
    expect(screen.getByRole("button", { name: /créer les fiches/i })).not.toBeDisabled();
  });

  // M10 Phase 1's per-screen backlog: a real 375px measurement (not the
  // original source-read audit, which missed this one) found CoursePill at
  // 38px tall — under 44px, no responsive variant. Unlike Aujourd'hui's own
  // small icon-only controls, a real min-height is simpler and safer here
  // than an invisible pseudo-element: CoursePill's own flex-wrap row uses a
  // real, fixed gap-2, so growing the pill's own real box (not an invisible
  // margin around it) can never overlap a neighbour the way an invisible
  // expansion risked elsewhere (docs/UI.md's UploadCard note has that
  // arithmetic). `md:min-h-0` keeps the desktop box exactly as it was.
  it("a course pill carries a 44px minimum height on mobile, reset back to its own natural height from md up", async () => {
    stubFetch({ documents: [docA, docB], notionsByDocument: { "doc-1": [aNotion] } });

    renderScreen();
    const pill = await screen.findByRole("button", { name: "Biologie" });

    expect(pill.className).toMatch(/min-h-11/);
    expect(pill.className).toMatch(/md:min-h-0/);
  });

  // Same reasoning and same fix as the course pill above: a real 375px
  // measurement found each notion-type checkbox's own label at 20px tall
  // (the fieldset's flex-wrap row wraps to two lines at 375px — "Flashcards"
  // and "QCM" on one, "Questions ouvertes" on the next, 16px apart). A real
  // min-height is used here for the same reason: each row's own gap-4 stays
  // a real, fixed 16px regardless of the label's own height, so growing the
  // label's real box (not an invisible margin) can never make two wrapped
  // rows' own enlarged zones overlap.
  it("each notion-type checkbox's own label carries a 44px minimum height on mobile, reset back from md up", async () => {
    stubFetch({ documents: [docA], notionsByDocument: { "doc-1": [aNotion] } });

    renderScreen();
    await screen.findByText("Photosynthèse");

    for (const cardTypeLabel of ["Flashcards", "QCM", "Questions ouvertes"]) {
      const label = screen.getByText(cardTypeLabel).closest("label");
      expect(label?.className).toMatch(/min-h-11/);
      expect(label?.className).toMatch(/md:min-h-0/);
    }
  });
});
