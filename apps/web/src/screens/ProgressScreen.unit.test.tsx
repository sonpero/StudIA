// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProgressScreen } from "./ProgressScreen.js";
import { todayDateKey } from "../lib/day-boundary.js";
import type { ProgressListItem } from "../lib/progress-api.js";
import type { Notion, NotionProgress } from "../lib/notions-api.js";

// Redesigned per a "Progress" mockup, ignoring docs/UI.md per the user: a
// pill row of every course (the same CoursePill idiom Notions/Lecteur
// already use), then the selected course's own detail card (a readiness
// ring, two coloured bars, a mastered/learning/due/not-started stat row,
// and a "Combler l'écart" CTA), then a compact "Tous les cours" list below
// — replacing the old uniform grid of one full card per course. A
// deliberate reversal of two of docs/UI.md's own rules, per the user's
// explicit instruction: subject colours now fill the coverage/readiness
// indicators (previously "for identity only, never progress or state"),
// and the per-card left border is gone in favour of a tinted icon circle
// (the same departure Aujourd'hui/Mes cours already made from their own
// mockups).
function renderScreen(
  overrides: Partial<{
    documentId: string;
    onBack: () => void;
    onOpenCourse: (documentId: string) => void;
    onReview: (documentId: string) => void;
  }> = {},
) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <ProgressScreen
        documentId={overrides.documentId}
        onBack={overrides.onBack ?? (() => undefined)}
        onOpenCourse={overrides.onOpenCourse ?? (() => undefined)}
        onReview={overrides.onReview ?? (() => undefined)}
      />
    </QueryClientProvider>,
  );
}

function dateOffset(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

const okBase = { colour: "#F87171", deadlineDate: null, deadlineLabel: null } as const;

function stubFetch(options: {
  items?: ProgressListItem[] | (() => Response);
  notionsByDocument?: Record<string, Notion[]>;
  notionsProgressByDocument?: Record<string, Partial<NotionProgress>[]>;
  extra?: (url: string, init?: RequestInit) => Response | undefined;
}) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      const extra = options.extra?.(url, init);
      if (extra) return Promise.resolve(extra);

      if (url.startsWith("/api/course-progress")) {
        if (typeof options.items === "function") return Promise.resolve(options.items());
        return Promise.resolve(new Response(JSON.stringify(options.items ?? []), { status: 200 }));
      }
      const notionsProgressMatch = /\/api\/documents\/([^/]+)\/notions-progress/.exec(url);
      if (notionsProgressMatch) {
        const rows = (options.notionsProgressByDocument?.[notionsProgressMatch[1]!] ?? []).map((row) => ({
          notionId: "",
          masteredCards: 0,
          totalCards: 0,
          cardsWithEnoughReps: 0,
          cardsWithEnoughStability: 0,
          reps: 0,
          nextDueDate: null,
          dueNow: false,
          ...row,
        }));
        return Promise.resolve(new Response(JSON.stringify(rows), { status: 200 }));
      }
      const notionsMatch = /\/api\/documents\/([^/]+)\/notions$/.exec(url);
      if (notionsMatch) {
        return Promise.resolve(new Response(JSON.stringify(options.notionsByDocument?.[notionsMatch[1]!] ?? []), { status: 200 }));
      }
      if (url.includes("/deadline")) {
        return Promise.resolve(new Response(null, { status: init?.method === "DELETE" ? 204 : 200 }));
      }
      return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
    }),
  );
}

const mathsItem: ProgressListItem = { documentId: "doc-1", title: "Maths", ...okBase, progress: { coverage: 0.54, readiness: 0.3, status: "no-deadline", behindByNotions: 0, recentlyAddedUnreviewed: 0 } };

describe("ProgressScreen", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("loading state: shows a skeleton, never a bare spinner", () => {
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(new Promise(() => {})));
    renderScreen();
    expect(screen.getByRole("heading", { name: "Progression" })).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("error state: a network failure shows the confused mascot and a retry button, never a raw error code", async () => {
    stubFetch({ items: () => new Response(null, { status: 500 }) });
    renderScreen();
    await screen.findByText(/impossible de charger/i);
    expect(screen.getByRole("button", { name: /réessayer/i })).toBeInTheDocument();
  });

  it("empty state: no courses at all invites the student to add one, never 'aucun résultat'", async () => {
    stubFetch({ items: [] });
    renderScreen();
    await screen.findByText(/aucun cours/i);
    expect(screen.queryByText(/aucun résultat/i)).not.toBeInTheDocument();
  });

  it("the gap between the title and what follows it is the same --space-section token in every state — loading, error and ready alike (docs/UI.md's Grid and spacing note)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(new Promise(() => {})));
    renderScreen();
    const loadingMain = screen.getByRole("heading", { name: "Progression" }).closest("main");
    expect(loadingMain?.className).toMatch(/gap-\[var\(--space-section\)\]/);
    cleanup();

    stubFetch({ items: () => new Response(null, { status: 500 }) });
    renderScreen();
    await screen.findByText(/impossible de charger/i);
    const errorMain = screen.getByRole("heading", { name: "Progression" }).closest("main");
    expect(errorMain?.className).toMatch(/gap-\[var\(--space-section\)\]/);
    cleanup();

    stubFetch({ items: [] });
    renderScreen();
    await screen.findByText(/aucun cours/i);
    const readyMain = screen.getByRole("heading", { name: "Progression" }).closest("main");
    expect(readyMain?.className).toMatch(/gap-\[var\(--space-section\)\]/);
  });

  it("ready: shows a pill for every course, the first one active by default (no documentId prop)", async () => {
    const histoire: ProgressListItem = { ...mathsItem, documentId: "doc-2", title: "Histoire", colour: "#38BDF8" };
    stubFetch({ items: [mathsItem, histoire] });
    renderScreen();

    expect(await screen.findByRole("button", { name: "Maths" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("button", { name: "Histoire" })).not.toHaveAttribute("aria-current");
  });

  it("a documentId prop pre-selects that course's pill (deep link from Notions du cours' own 'Voir la progression')", async () => {
    const histoire: ProgressListItem = { ...mathsItem, documentId: "doc-2", title: "Histoire", colour: "#38BDF8" };
    stubFetch({ items: [mathsItem, histoire] });
    renderScreen({ documentId: "doc-2" });

    expect(await screen.findByRole("button", { name: "Histoire" })).toHaveAttribute("aria-current", "page");
  });

  it("clicking a different pill switches the detail card's own course, a local selection not a navigation", async () => {
    const histoire: ProgressListItem = { ...mathsItem, documentId: "doc-2", title: "Histoire", colour: "#38BDF8", progress: { coverage: 0.1, readiness: 0, status: "no-deadline", behindByNotions: 0, recentlyAddedUnreviewed: 0 } };
    stubFetch({ items: [mathsItem, histoire] });
    const user = userEvent.setup();
    renderScreen();

    const detail = await screen.findByTestId("progress-detail-card");
    await within(detail).findByText("Maths");
    await user.click(screen.getByRole("button", { name: "Histoire" }));

    await within(screen.getByTestId("progress-detail-card")).findByText("Histoire");
  });

  it("ready: the detail card shows the selected course's title at --text-title and its coverage/readiness percentages", async () => {
    stubFetch({ items: [mathsItem] });
    renderScreen();

    const detail = await screen.findByTestId("progress-detail-card");
    const title = within(detail).getByText("Maths");
    expect(title.className).toContain("text-[length:var(--text-title)]");
    expect(within(detail).getByText(/54\s?%/)).toBeInTheDocument();
    // 30 % (readiness) is deliberately shown twice on this card — the ring
    // and the linear "Préparation" gauge both duplicate it (docs/UI.md's
    // Progression note) — so this checks presence, not uniqueness.
    expect(within(detail).getAllByText(/30\s?%/).length).toBeGreaterThan(0);
  });

  it("exposes coverage and readiness as accessible meters on the detail card, carrying the exact value", async () => {
    stubFetch({ items: [mathsItem] });
    renderScreen();

    const detail = await screen.findByTestId("progress-detail-card");
    expect(within(detail).getByRole("meter", { name: "Couverture" })).toHaveAttribute("aria-valuenow", "54");
    expect(within(detail).getByRole("meter", { name: "Préparation" })).toHaveAttribute("aria-valuenow", "30");
  });

  it("bar fill width tracks each gauge's own value, never a flat 100% regardless of it (a real regression: a bare-percent width string once failed to parse as CSS and rendered as full-width for every value)", async () => {
    const item = { ...mathsItem, progress: { coverage: 0.71, readiness: 0.32, status: "no-deadline" as const, behindByNotions: 0, recentlyAddedUnreviewed: 0 } };
    stubFetch({ items: [item] });
    renderScreen();

    const detail = await screen.findByTestId("progress-detail-card");
    const coverageFill = within(within(detail).getByRole("meter", { name: "Couverture" })).getByTestId("gauge-fill");
    const readinessFill = within(within(detail).getByRole("meter", { name: "Préparation" })).getByTestId("gauge-fill");
    expect(coverageFill).toHaveStyle({ width: "71%" });
    expect(readinessFill).toHaveStyle({ width: "32%" });
  });

  it("the detail card's own gauges are filled with the selected course's own colour, a deliberate reversal of docs/UI.md's former 'subject colours never indicate progress' rule, per the user's explicit instruction", async () => {
    const item = { ...mathsItem, colour: "#38BDF8" };
    stubFetch({ items: [item] });
    renderScreen();

    const detail = await screen.findByTestId("progress-detail-card");
    const coverageFill = within(within(detail).getByRole("meter", { name: "Couverture" })).getByTestId("gauge-fill");
    expect(coverageFill).toHaveStyle({ backgroundColor: "rgb(56, 189, 248)" });
  });

  it("the 'All courses' list also fills each row's own bars with that row's own course colour, distinct per row", async () => {
    const histoire: ProgressListItem = { ...mathsItem, documentId: "doc-2", title: "Histoire", colour: "#38BDF8", progress: { coverage: 0.6, readiness: 0.5, status: "no-deadline", behindByNotions: 0, recentlyAddedUnreviewed: 0 } };
    stubFetch({ items: [mathsItem, histoire] });
    renderScreen();

    await screen.findAllByTestId("progress-list-row");
    const rows = screen.getAllByTestId("progress-list-row");
    const mathsRow = rows.find((r) => within(r).queryByText("Maths"))!;
    const histoireRow = rows.find((r) => within(r).queryByText("Histoire"))!;
    const mathsFill = within(within(mathsRow).getByRole("meter", { name: "Couverture" })).getByTestId("gauge-fill");
    const histoireFill = within(within(histoireRow).getByRole("meter", { name: "Couverture" })).getByTestId("gauge-fill");
    expect(mathsFill).toHaveStyle({ backgroundColor: "rgb(248, 113, 113)" });
    expect(histoireFill).toHaveStyle({ backgroundColor: "rgb(56, 189, 248)" });
  });

  it("clicking an 'All courses' row selects that course, updating the pill and the detail card", async () => {
    const histoire: ProgressListItem = { ...mathsItem, documentId: "doc-2", title: "Histoire", colour: "#38BDF8" };
    stubFetch({ items: [mathsItem, histoire] });
    const user = userEvent.setup();
    renderScreen();

    await screen.findAllByTestId("progress-list-row");
    const rows = screen.getAllByTestId("progress-list-row");
    const histoireRow = rows.find((r) => within(r).queryByText("Histoire"))!;
    await user.click(histoireRow);

    expect(screen.getByRole("button", { name: "Histoire" })).toHaveAttribute("aria-current", "page");
  });

  it("the mastered/learning/due/not-started stat tiles partition the selected course's own notions, computed from notions + notions-progress", async () => {
    stubFetch({
      items: [mathsItem],
      notionsByDocument: { "doc-1": [{ id: "n1" }, { id: "n2" }, { id: "n3" }, { id: "n4" }].map((n, i) => ({ ...n, documentId: "doc-1", userId: "u1", title: `Notion ${i}`, body: "", difficulty: "medium", position: i, createdAt: "2026-01-01T00:00:00Z" })) },
      notionsProgressByDocument: {
        "doc-1": [
          { notionId: "n1", totalCards: 3, masteredCards: 3 }, // mastered
          { notionId: "n2", totalCards: 2, masteredCards: 0, dueNow: true }, // due
          { notionId: "n3", totalCards: 2, masteredCards: 0, dueNow: false }, // learning
          // n4 has no progress row at all -> not started
        ],
      },
    });
    renderScreen();

    const detail = await screen.findByTestId("progress-detail-card");
    await within(detail).findByTestId("stat-mastered");
    expect(within(detail).getByTestId("stat-mastered")).toHaveTextContent("1");
    expect(within(detail).getByTestId("stat-due")).toHaveTextContent("1");
    expect(within(detail).getByTestId("stat-learning")).toHaveTextContent("1");
    expect(within(detail).getByTestId("stat-not-started")).toHaveTextContent("1");
  });

  it("'Combler l'écart' is the accent CTA when at least one notion is due, and calls onReview with the selected course's id", async () => {
    const onReview = vi.fn();
    stubFetch({
      items: [mathsItem],
      notionsByDocument: { "doc-1": [{ id: "n1", documentId: "doc-1", userId: "u1", title: "N1", body: "", difficulty: "medium" as const, position: 0, createdAt: "2026-01-01T00:00:00Z" }] },
      notionsProgressByDocument: { "doc-1": [{ notionId: "n1", totalCards: 2, masteredCards: 0, dueNow: true }] },
    });
    const user = userEvent.setup();
    renderScreen({ onReview });

    const detail = await screen.findByTestId("progress-detail-card");
    const cta = await within(detail).findByRole("button", { name: /combler l'écart/i });
    await user.click(cta);

    expect(onReview).toHaveBeenCalledWith("doc-1");
  });

  it("'Rien à réviser', disabled, when nothing is due for the selected course", async () => {
    stubFetch({
      items: [mathsItem],
      notionsByDocument: { "doc-1": [{ id: "n1", documentId: "doc-1", userId: "u1", title: "N1", body: "", difficulty: "medium" as const, position: 0, createdAt: "2026-01-01T00:00:00Z" }] },
      notionsProgressByDocument: { "doc-1": [{ notionId: "n1", totalCards: 3, masteredCards: 3 }] },
    });
    renderScreen();

    const detail = await screen.findByTestId("progress-detail-card");
    const button = await within(detail).findByRole("button", { name: /rien à réviser/i });
    expect(button).toBeDisabled();
  });

  it("'Voir le cours' on the detail card calls onOpenCourse with the selected course's id, and pairs its icon decoratively", async () => {
    const onOpenCourse = vi.fn();
    stubFetch({ items: [mathsItem] });
    const user = userEvent.setup();
    renderScreen({ onOpenCourse });

    const detail = await screen.findByTestId("progress-detail-card");
    const button = within(detail).getByRole("button", { name: "Voir le cours" });
    const icon = button.querySelector("svg");
    expect(icon).toHaveAttribute("aria-hidden", "true");
    expect(icon).toHaveAttribute("focusable", "false");

    await user.click(button);
    expect(onOpenCourse).toHaveBeenCalledWith("doc-1");
  });

  it("no deadline set: the two numbers and an invitation, never a warning about the missing deadline", async () => {
    stubFetch({ items: [mathsItem] });
    renderScreen();
    const detail = await screen.findByTestId("progress-detail-card");
    expect(detail).toHaveAttribute("data-status", "no-deadline");
    expect(within(detail).getByText(/aucune échéance pour l'instant/i)).toBeInTheDocument();
    expect(within(detail).getByRole("button", { name: /définir une échéance/i })).toBeInTheDocument();
  });

  it("behind: states the notion count as a plain fact next to the deadline countdown, no --warning, no accent styling", async () => {
    const item = { ...mathsItem, deadlineDate: dateOffset(9), progress: { coverage: 0.54, readiness: 0.3, status: "behind" as const, behindByNotions: 7, recentlyAddedUnreviewed: 0 } };
    stubFetch({ items: [item] });
    renderScreen();

    const detail = await screen.findByTestId("progress-detail-card");
    expect(detail).toHaveAttribute("data-status", "behind");
    expect(within(detail).getByText(/9 jours/)).toBeInTheDocument();
    expect(within(detail).getByText(/7 notions/)).toBeInTheDocument();
    expect(within(detail).queryByText(/tu es en retard/i)).not.toBeInTheDocument();
  });

  it("deadline day itself: status and behindByNotions are computed but not displayed — no status word, no notion count, a neutral framing instead", async () => {
    const item = { ...mathsItem, deadlineDate: todayDateKey(), progress: { coverage: 0.5, readiness: 0.4, status: "behind" as const, behindByNotions: 12, recentlyAddedUnreviewed: 0 } };
    stubFetch({ items: [item] });
    renderScreen();

    const detail = await screen.findByTestId("progress-detail-card");
    expect(detail).toHaveAttribute("data-status", "today");
    expect(within(detail).getByText(/aujourd'hui/i)).toBeInTheDocument();
    expect(within(detail).queryByText(/12 notions/)).not.toBeInTheDocument();
  });

  it("deadline-in-past: coverage/readiness still show, the message reads 'Cette échéance est passée.' above the gauges, and both update/delete actions are offered", async () => {
    const item = { documentId: "doc-1", title: "Maths", colour: "#F87171", deadlineDate: "2020-01-01", deadlineLabel: "Vieux contrôle", progress: { coverage: 0.6, readiness: 0.2, status: "deadline-in-past" as const, behindByNotions: 0, recentlyAddedUnreviewed: 0 } };
    stubFetch({ items: [item] });
    renderScreen();

    const detail = await screen.findByTestId("progress-detail-card");
    expect(detail).toHaveAttribute("data-status", "deadline-in-past");
    const message = within(detail).getByText("Cette échéance est passée.");
    expect(message.className).toContain("font-semibold");
    expect(within(detail).getByRole("meter", { name: "Couverture" })).toHaveAttribute("aria-valuenow", "60");

    const updateButton = within(detail).getByRole("button", { name: /modifier l'échéance/i });
    expect(updateButton.tagName).toBe("BUTTON");
    const deleteLink = within(detail).getByRole("button", { name: /supprimer l'échéance/i });
    expect(deleteLink.className).toMatch(/underline/);
  });

  it("deleting a deadline sends a DELETE and refreshes", async () => {
    const item = { documentId: "doc-1", title: "Maths", colour: "#F87171", deadlineDate: "2020-01-01", deadlineLabel: "Vieux contrôle", progress: { coverage: 0.6, readiness: 0.2, status: "deadline-in-past" as const, behindByNotions: 0, recentlyAddedUnreviewed: 0 } };
    stubFetch({ items: [item] });
    const user = userEvent.setup();
    renderScreen();

    const detail = await screen.findByTestId("progress-detail-card");
    await user.click(within(detail).getByRole("button", { name: /supprimer l'échéance/i }));

    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    const call = fetchMock.mock.calls.find((args: unknown[]) => args[0] === "/api/documents/doc-1/deadline" && (args[1] as { method?: string } | undefined)?.method === "DELETE");
    expect(call).toBeDefined();
  });

  it("setting a deadline submits the chosen date and refreshes the list", async () => {
    stubFetch({ items: [mathsItem] });
    const user = userEvent.setup();
    renderScreen();
    const detail = await screen.findByTestId("progress-detail-card");

    await user.click(within(detail).getByRole("button", { name: /définir une échéance/i }));
    await user.type(screen.getByLabelText(/date/i), "2026-05-01");
    await user.click(screen.getByRole("button", { name: /^enregistrer/i }));

    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    const call = fetchMock.mock.calls.find((args: unknown[]) => args[0] === "/api/documents/doc-1/deadline");
    expect(call).toBeDefined();
    expect(call?.[1]).toMatchObject({ method: "POST" });
    expect(JSON.parse((call?.[1] as { body: string }).body)).toEqual({ date: "2026-05-01" });
  });

  it("recentlyAddedUnreviewed > 0: states the present-tense fact about recently added notions, never 'la couverture a baissé'", async () => {
    const item = { ...mathsItem, progress: { coverage: 0.2, readiness: 0.1, status: "no-deadline" as const, behindByNotions: 0, recentlyAddedUnreviewed: 3 } };
    stubFetch({ items: [item] });
    renderScreen();
    await screen.findByText(/3 notions ajoutées récemment n'ont pas encore été travaillées/i);
    expect(screen.queryByText(/couverture a baissé/i)).not.toBeInTheDocument();
  });

  it("no mascot on the ready state itself: this is a data-dense list of courses (docs/UI.md)", async () => {
    stubFetch({ items: [mathsItem] });
    renderScreen();
    await screen.findByTestId("progress-detail-card");
    expect(document.querySelectorAll("svg[data-testid='mascot']")).toHaveLength(0);
  });
});
