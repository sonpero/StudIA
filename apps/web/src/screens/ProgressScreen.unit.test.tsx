// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProgressScreen } from "./ProgressScreen.js";
import { todayDateKey } from "../lib/day-boundary.js";
import type { ProgressListItem } from "../lib/progress-api.js";

function renderScreen(overrides: Partial<{ onBack: () => void; onOpenCourse: (documentId: string) => void }> = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <ProgressScreen onBack={overrides.onBack ?? (() => undefined)} onOpenCourse={overrides.onOpenCourse ?? (() => undefined)} />
    </QueryClientProvider>,
  );
}

function stubFetch(items: ProgressListItem[] | (() => Response)) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation(() => {
      if (typeof items === "function") return Promise.resolve(items());
      return Promise.resolve(new Response(JSON.stringify(items), { status: 200 }));
    }),
  );
}

function dateOffset(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

const okBase = { colour: "#F87171", deadlineDate: null, deadlineLabel: null } as const;

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
    stubFetch(() => new Response(null, { status: 500 }));
    renderScreen();
    await screen.findByText(/impossible de charger/i);
    expect(screen.getByRole("button", { name: /réessayer/i })).toBeInTheDocument();
  });

  it("empty state: no courses at all invites the student to add one, never 'aucun résultat'", async () => {
    stubFetch([]);
    renderScreen();
    await screen.findByText(/aucun cours/i);
    expect(screen.queryByText(/aucun résultat/i)).not.toBeInTheDocument();
  });

  it("ready state: renders one card per course with its title, coverage, and readiness", async () => {
    stubFetch([
      { documentId: "doc-1", title: "Maths", ...okBase, deadlineDate: dateOffset(9), kind: "ok", progress: { coverage: 0.54, readiness: 0.3, status: "behind", behindByNotions: 7, recentlyAddedUnreviewed: 0 } },
    ]);
    renderScreen();
    await screen.findByText("Maths");
    expect(screen.getByText(/54\s?%/)).toBeInTheDocument();
    expect(screen.getByText(/30\s?%/)).toBeInTheDocument();
  });

  it("ready state: a course card's title is --text-title, up from the plain body size it shared with everything else before this pass (docs/UI.md's Type note)", async () => {
    stubFetch([
      { documentId: "doc-1", title: "Maths", ...okBase, kind: "ok", progress: { coverage: 0.54, readiness: 0.3, status: "no-deadline", behindByNotions: 0, recentlyAddedUnreviewed: 0 } },
    ]);
    renderScreen();
    const title = await screen.findByText("Maths");
    expect(title.className).toContain("text-[var(--text-title)]");
  });

  it("ready state: a gauge's percentage is the dominant number on its line, --text-display, its label small and muted (docs/UI.md's Type note)", async () => {
    stubFetch([
      { documentId: "doc-1", title: "Maths", ...okBase, kind: "ok", progress: { coverage: 0.54, readiness: 0.3, status: "no-deadline", behindByNotions: 0, recentlyAddedUnreviewed: 0 } },
    ]);
    renderScreen();
    await screen.findByText("Maths");

    const percentValue = screen.getByText(/54\s?%/);
    expect(percentValue.className).toContain("text-[var(--text-display)]");
    const label = screen.getByText("Couverture");
    expect(label.className).toContain("text-[var(--text-label)]");
    expect(label.className).not.toContain("text-[var(--text-display)]");
  });

  it("ready state: a course card's subject colour is a left border on the whole card (docs/UI.md's Subject colours note) — this screen carried no colour marker before", async () => {
    stubFetch([
      { documentId: "doc-1", title: "Maths", ...okBase, colour: "#F87171", kind: "ok", progress: { coverage: 0.54, readiness: 0.3, status: "no-deadline", behindByNotions: 0, recentlyAddedUnreviewed: 0 } },
      { documentId: "doc-2", title: "Histoire", ...okBase, colour: "#38BDF8", kind: "ok", progress: { coverage: 0.1, readiness: 0, status: "no-deadline", behindByNotions: 0, recentlyAddedUnreviewed: 0 } },
    ]);
    renderScreen();
    const mathsCard = (await screen.findByText("Maths")).closest('[data-testid="progress-card"]') as HTMLElement;
    const histoireCard = screen.getByText("Histoire").closest('[data-testid="progress-card"]') as HTMLElement;

    expect(mathsCard).toHaveStyle({ borderLeftColor: "#F87171" });
    expect(histoireCard).toHaveStyle({ borderLeftColor: "#38BDF8" });
  });

  it("ready state: 'Voir le cours' and 'Définir une échéance' each pair a decorative icon with their label — the accessible name stays exactly the label (docs/UI.md's Icons note)", async () => {
    stubFetch([
      { documentId: "doc-1", title: "Maths", ...okBase, kind: "ok", progress: { coverage: 0.54, readiness: 0.3, status: "no-deadline", behindByNotions: 0, recentlyAddedUnreviewed: 0 } },
    ]);
    renderScreen();
    await screen.findByText("Maths");

    for (const name of ["Voir le cours", "Définir une échéance"]) {
      const button = screen.getByRole("button", { name });
      const icon = button.querySelector("svg");
      expect(icon).not.toBeNull();
      expect(icon).toHaveAttribute("aria-hidden", "true");
      expect(icon).toHaveAttribute("focusable", "false");
    }
  });

  it("exposes coverage and readiness as accessible meters carrying the exact value, not just rounded display text", async () => {
    stubFetch([
      { documentId: "doc-1", title: "Maths", ...okBase, kind: "ok", progress: { coverage: 0.54, readiness: 0.3, status: "no-deadline", behindByNotions: 0, recentlyAddedUnreviewed: 0 } },
    ]);
    renderScreen();
    await screen.findByText("Maths");
    expect(screen.getByRole("meter", { name: "Couverture" })).toHaveAttribute("aria-valuenow", "54");
    expect(screen.getByRole("meter", { name: "Préparation" })).toHaveAttribute("aria-valuenow", "30");
  });

  it("bar fill width tracks each gauge's own value, never a flat 100% regardless of it (a real regression: a bare-percent width string once failed to parse as CSS and rendered as full-width for every value)", async () => {
    stubFetch([
      { documentId: "doc-1", title: "Maths", ...okBase, kind: "ok", progress: { coverage: 0.71, readiness: 0.32, status: "no-deadline", behindByNotions: 0, recentlyAddedUnreviewed: 0 } },
    ]);
    renderScreen();
    await screen.findByText("Maths");

    const coverageFill = within(screen.getByRole("meter", { name: "Couverture" })).getByTestId("gauge-fill");
    const readinessFill = within(screen.getByRole("meter", { name: "Préparation" })).getByTestId("gauge-fill");
    expect(coverageFill).toHaveStyle({ width: "71%" });
    expect(readinessFill).toHaveStyle({ width: "32%" });
  });

  it("no mascot in the ready state: this is a data-dense list of courses (docs/UI.md)", async () => {
    stubFetch([{ documentId: "doc-1", title: "Maths", ...okBase, kind: "ok", progress: { coverage: 1, readiness: 1, status: "no-deadline", behindByNotions: 0, recentlyAddedUnreviewed: 0 } }]);
    renderScreen();
    await screen.findByText("Maths");
    expect(document.querySelectorAll("svg[data-testid='mascot']")).toHaveLength(0);
  });

  it("behind: states the notion count as a plain fact, the same visual weight as the rest of the card — no box, no underline, no --accent", async () => {
    stubFetch([
      { documentId: "doc-1", title: "Maths", ...okBase, deadlineDate: dateOffset(9), kind: "ok", progress: { coverage: 0.54, readiness: 0.3, status: "behind", behindByNotions: 7, recentlyAddedUnreviewed: 0 } },
    ]);
    renderScreen();
    const card = await screen.findByTestId("progress-card");
    expect(card).toHaveAttribute("data-status", "behind");
    expect(screen.getByText(/9 jours/)).toBeInTheDocument();
    const notionCount = screen.getByText(/7 notions/);
    expect(notionCount).toBeInTheDocument();
    // Never blame the person directly (docs/UI.md: no "tu es en retard").
    expect(screen.queryByText(/tu es en retard/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/de retard/i)).not.toBeInTheDocument();
    // Structural, not just textual: docs/UI.md forbids --accent for "behind"
    // (it's the course-subject colour, not a status colour) — this must
    // still catch a future edit that switches the warning styling to
    // Button's variant="accent" or a raw bg-accent/text-accent/border-accent
    // class, not just today's copy.
    expect(card.querySelectorAll('[class*="accent"]')).toHaveLength(0);
    // docs/UI.md: a fact stated soberly, never the loudest element on the
    // card — no boxed/badge treatment (border, background tint, pill
    // radius, padding) and no underline, whichever element carries the text.
    expect(notionCount.className).not.toMatch(/border|bg-warning|rounded-full|px-|py-|underline/);
  });

  it("ahead or on-track: no notion count shown, no warning marker", async () => {
    stubFetch([
      { documentId: "doc-1", title: "Maths", ...okBase, deadlineDate: dateOffset(9), kind: "ok", progress: { coverage: 0.9, readiness: 0.95, status: "ahead", behindByNotions: 0, recentlyAddedUnreviewed: 0 } },
    ]);
    renderScreen();
    const card = await screen.findByTestId("progress-card");
    expect(card).toHaveAttribute("data-status", "ahead");
    expect(screen.queryByText(/notions? à consolider/)).not.toBeInTheDocument();
  });

  it("recentlyAddedUnreviewed > 0: states the present-tense fact about recently added notions, in notions (recentlyAddedUnreviewed counts notions, not cards — the two units coexist elsewhere and must not be confused), never 'la couverture a baissé'", async () => {
    stubFetch([
      { documentId: "doc-1", title: "Maths", ...okBase, kind: "ok", progress: { coverage: 0.2, readiness: 0.1, status: "no-deadline", behindByNotions: 0, recentlyAddedUnreviewed: 3 } },
    ]);
    renderScreen();
    await screen.findByText(/3 notions ajoutées récemment n'ont pas encore été travaillées/i);
    expect(screen.queryByText(/fiches? ajoutée/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/couverture a baissé/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/a chuté/i)).not.toBeInTheDocument();
  });

  it("deadline day itself: status and behindByNotions are computed but not displayed — no status word, no notion count, a neutral framing instead", async () => {
    stubFetch([
      {
        documentId: "doc-1",
        title: "Maths",
        ...okBase,
        deadlineDate: todayDateKey(),
        kind: "ok",
        progress: { coverage: 0.5, readiness: 0.4, status: "behind", behindByNotions: 12, recentlyAddedUnreviewed: 0 },
      },
    ]);
    renderScreen();
    const card = await screen.findByTestId("progress-card");
    expect(card).toHaveAttribute("data-status", "today");
    expect(screen.getByText(/aujourd'hui/i)).toBeInTheDocument();
    expect(screen.queryByText(/12 notions/)).not.toBeInTheDocument();
    // The percentages are still shown plainly.
    expect(screen.getByText(/50\s?%/)).toBeInTheDocument();
    expect(screen.getByText(/40\s?%/)).toBeInTheDocument();
  });

  it("deadline-in-past in the aggregate list: an actionable line, never a disappearing row or a raw error code", async () => {
    stubFetch([
      { documentId: "doc-1", title: "Maths", colour: "#F87171", deadlineDate: "2020-01-01", deadlineLabel: "Vieux contrôle", kind: "error", error: "deadline-in-past" },
      { documentId: "doc-2", title: "Histoire", ...okBase, kind: "ok", progress: { coverage: 1, readiness: 1, status: "no-deadline", behindByNotions: 0, recentlyAddedUnreviewed: 0 } },
    ]);
    renderScreen();
    await screen.findByText("Maths");
    await screen.findByText("Histoire");
    expect(screen.getByText(/passée/i)).toBeInTheDocument();
    expect(screen.queryByText(/deadline-in-past/)).not.toBeInTheDocument();
    expect(screen.queryByText(/\[object/)).not.toBeInTheDocument();
  });

  it("no deadline set: the two numbers and an invitation, never a warning about the missing deadline", async () => {
    stubFetch([{ documentId: "doc-1", title: "Maths", ...okBase, kind: "ok", progress: { coverage: 0.4, readiness: 0.1, status: "no-deadline", behindByNotions: 0, recentlyAddedUnreviewed: 0 } }]);
    renderScreen();
    const card = await screen.findByTestId("progress-card");
    expect(card).toHaveAttribute("data-status", "no-deadline");
    expect(screen.getByText(/40\s?%/)).toBeInTheDocument();
    expect(screen.getByText(/10\s?%/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /définir une échéance/i })).toBeInTheDocument();
    expect(screen.queryByText(/aucune échéance.*!/i)).not.toBeInTheDocument();
  });

  it("each card, whatever its kind, offers 'Voir le cours', which opens that course — symmetric to Aujourd'hui's own card action, no label collision with the nav's 'Progression' item", async () => {
    const onOpenCourse = vi.fn();
    stubFetch([
      { documentId: "doc-1", title: "Maths", colour: "#F87171", deadlineDate: "2020-01-01", deadlineLabel: "Vieux contrôle", kind: "error", error: "deadline-in-past" },
      { documentId: "doc-2", title: "Histoire", ...okBase, kind: "ok", progress: { coverage: 0.4, readiness: 0.1, status: "no-deadline", behindByNotions: 0, recentlyAddedUnreviewed: 0 } },
    ]);
    const user = userEvent.setup();
    renderScreen({ onOpenCourse });
    await screen.findByText("Maths");
    await screen.findByText("Histoire");

    const mathsCard = screen.getByText("Maths").closest('[data-testid="progress-card"]') as HTMLElement;
    const histoireCard = screen.getByText("Histoire").closest('[data-testid="progress-card"]') as HTMLElement;

    await user.click(within(mathsCard).getByRole("button", { name: "Voir le cours" }));
    expect(onOpenCourse).toHaveBeenCalledWith("doc-1");

    await user.click(within(histoireCard).getByRole("button", { name: "Voir le cours" }));
    expect(onOpenCourse).toHaveBeenCalledWith("doc-2");
  });

  it("setting a deadline submits the chosen date and refreshes the list", async () => {
    stubFetch([{ documentId: "doc-1", title: "Maths", ...okBase, kind: "ok", progress: { coverage: 0.4, readiness: 0.1, status: "no-deadline", behindByNotions: 0, recentlyAddedUnreviewed: 0 } }]);
    const user = userEvent.setup();
    renderScreen();
    await screen.findByTestId("progress-card");

    await user.click(screen.getByRole("button", { name: /définir une échéance/i }));
    await user.type(screen.getByLabelText(/date/i), "2026-05-01");
    await user.click(screen.getByRole("button", { name: /^enregistrer/i }));

    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    const call = fetchMock.mock.calls.find((args: unknown[]) => args[0] === "/api/documents/doc-1/deadline");
    expect(call).toBeDefined();
    expect(call?.[1]).toMatchObject({ method: "POST" });
    expect(JSON.parse((call?.[1] as { body: string }).body)).toEqual({ date: "2026-05-01" });
  });
});
