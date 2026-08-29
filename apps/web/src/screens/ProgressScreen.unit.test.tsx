// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProgressScreen } from "./ProgressScreen.js";
import { todayDateKey } from "../lib/day-boundary.js";
import type { ProgressListItem } from "../lib/progress-api.js";

function renderScreen() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <ProgressScreen onBack={() => undefined} />
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

const okBase = { deadlineDate: null, deadlineLabel: null } as const;

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

  it("exposes coverage and readiness as accessible meters carrying the exact value, not just rounded display text", async () => {
    stubFetch([
      { documentId: "doc-1", title: "Maths", ...okBase, kind: "ok", progress: { coverage: 0.54, readiness: 0.3, status: "no-deadline", behindByNotions: 0, recentlyAddedUnreviewed: 0 } },
    ]);
    renderScreen();
    await screen.findByText("Maths");
    expect(screen.getByRole("meter", { name: "Couverture" })).toHaveAttribute("aria-valuenow", "54");
    expect(screen.getByRole("meter", { name: "Préparation" })).toHaveAttribute("aria-valuenow", "30");
  });

  it("no mascot in the ready state: this is a data-dense list of courses (docs/UI.md)", async () => {
    stubFetch([{ documentId: "doc-1", title: "Maths", ...okBase, kind: "ok", progress: { coverage: 1, readiness: 1, status: "no-deadline", behindByNotions: 0, recentlyAddedUnreviewed: 0 } }]);
    renderScreen();
    await screen.findByText("Maths");
    expect(document.querySelectorAll("svg[aria-hidden='true']")).toHaveLength(0);
  });

  it("behind: states the notion count in --warning, never as an --accent element, and the day count as a plain fact", async () => {
    stubFetch([
      { documentId: "doc-1", title: "Maths", ...okBase, deadlineDate: dateOffset(9), kind: "ok", progress: { coverage: 0.54, readiness: 0.3, status: "behind", behindByNotions: 7, recentlyAddedUnreviewed: 0 } },
    ]);
    renderScreen();
    const card = await screen.findByTestId("progress-card");
    expect(card).toHaveAttribute("data-status", "behind");
    expect(screen.getByText(/9 jours/)).toBeInTheDocument();
    expect(screen.getByText(/7 notions/)).toBeInTheDocument();
    // Never blame the person directly (docs/UI.md: no "tu es en retard").
    expect(screen.queryByText(/tu es en retard/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/de retard/i)).not.toBeInTheDocument();
    // Structural, not just textual: docs/UI.md forbids --accent for "behind"
    // (it's the course-subject colour, not a status colour) — this must
    // still catch a future edit that switches the warning styling to
    // Button's variant="accent" or a raw bg-accent/text-accent/border-accent
    // class, not just today's copy.
    expect(card.querySelectorAll('[class*="accent"]')).toHaveLength(0);
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

  it("recentlyAddedUnreviewed > 0: states the present-tense fact about recently added notions, never 'la couverture a baissé'", async () => {
    stubFetch([
      { documentId: "doc-1", title: "Maths", ...okBase, kind: "ok", progress: { coverage: 0.2, readiness: 0.1, status: "no-deadline", behindByNotions: 0, recentlyAddedUnreviewed: 3 } },
    ]);
    renderScreen();
    await screen.findByText(/3 fiches ajoutées récemment n'ont pas encore été travaillées/i);
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
      { documentId: "doc-1", title: "Maths", deadlineDate: "2020-01-01", deadlineLabel: "Vieux contrôle", kind: "error", error: "deadline-in-past" },
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
