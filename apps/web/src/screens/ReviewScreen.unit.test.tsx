// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ReviewScreen } from "./ReviewScreen.js";

function renderScreen(props: { notionId?: string } = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <ReviewScreen documentId="doc-1" notionId={props.notionId} onLeave={() => undefined} />
    </QueryClientProvider>,
  );
  return queryClient;
}

const aDueCard = {
  cardId: "c1",
  notionId: "n1",
  type: "flashcard" as const,
  state: "active" as const,
  question: "Que produit la photosynthèse ?",
  answer: "De l'oxygène",
  options: null,
  schedule: null,
  mastered: false,
};

describe("ReviewScreen", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("loading state: shows a skeleton while the session is starting", () => {
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(new Promise(() => {})));

    renderScreen();

    expect(screen.getByText("Révision")).toBeInTheDocument();
    expect(screen.queryByText(/tout est à jour/i)).not.toBeInTheDocument();
  });

  it("error state: shows the confused mascot and a retry action", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 500 })));

    renderScreen();

    expect(await screen.findByText(/impossible de démarrer la révision/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /réessayer/i })).toBeInTheDocument();
  });

  it("empty state: reframes as positive (everything is up to date), sleeping mascot, no urgency copy", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        if (url.includes("/progress")) return Promise.resolve(new Response(JSON.stringify({ mastered: 0, total: 0, nextDueDate: null }), { status: 200 }));
        return Promise.resolve(new Response(JSON.stringify({ sessionId: "s1", cards: [] }), { status: 200 }));
      }),
    );

    renderScreen();

    expect(await screen.findByText(/tout est à jour/i)).toBeInTheDocument();
    expect(screen.queryByText(/rien à réviser/i)).not.toBeInTheDocument();
  });

  it("empty state: shows the next due date when it falls on a different day", async () => {
    // Clock mocked, not real Date.now(): "now" and nextDueDate must land on
    // different calendar days regardless of when the test suite runs.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-08-28T10:00:00.000Z"));
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        if (url.includes("/progress")) return Promise.resolve(new Response(JSON.stringify({ mastered: 1, total: 3, nextDueDate: "2026-03-05T00:00:00.000Z" }), { status: 200 }));
        return Promise.resolve(new Response(JSON.stringify({ sessionId: "s1", cards: [] }), { status: 200 }));
      }),
    );

    renderScreen();

    expect(await screen.findByText(/5 mars 2026/i)).toBeInTheDocument();
    expect(screen.queryByText(/plus tard dans la journée/i)).not.toBeInTheDocument();
  });

  it("empty state: says 'reviens plus tard' instead of a date when the next due card is due later today", async () => {
    // A bug report: nextDueDate is always strictly future (getProgress
    // filters `due > now`), but a timestamp later today still falls on
    // today's date — announcing it as a future date reads as contradictory
    // next to "Tout est à jour.". Built with the local-time constructor and
    // local arithmetic (not fixed UTC strings) so "same calendar day" holds
    // regardless of the machine's timezone running the test.
    vi.useFakeTimers({ toFake: ["Date"] });
    const now = new Date(2026, 7, 28, 10, 0, 0);
    vi.setSystemTime(now);
    const laterToday = new Date(now);
    laterToday.setHours(laterToday.getHours() + 4);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        if (url.includes("/progress")) return Promise.resolve(new Response(JSON.stringify({ mastered: 1, total: 3, nextDueDate: laterToday.toISOString() }), { status: 200 }));
        return Promise.resolve(new Response(JSON.stringify({ sessionId: "s1", cards: [] }), { status: 200 }));
      }),
    );

    renderScreen();

    expect(await screen.findByText("Reviens un peu plus tard dans la journée.")).toBeInTheDocument();
    expect(screen.queryByText(/28 août 2026/i)).not.toBeInTheDocument();
  });

  it("empty state: says nothing about a next due date when none is known", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        if (url.includes("/progress")) return Promise.resolve(new Response(JSON.stringify({ mastered: 0, total: 0, nextDueDate: null }), { status: 200 }));
        return Promise.resolve(new Response(JSON.stringify({ sessionId: "s1", cards: [] }), { status: 200 }));
      }),
    );

    renderScreen();

    await screen.findByText(/tout est à jour/i);
    expect(screen.queryByText(/prochaine fiche/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/plus tard dans la journée/i)).not.toBeInTheDocument();
  });

  it("ready state: shows the question, reveals the answer on demand, then rates and advances", async () => {
    const user = userEvent.setup();
    const calls: { url: string; body?: unknown }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string, init?: RequestInit) => {
        calls.push({ url, body: init?.body ? (JSON.parse(init.body as string) as unknown) : undefined });
        if (url === "/api/review/sessions") {
          return Promise.resolve(new Response(JSON.stringify({ sessionId: "s1", cards: [aDueCard] }), { status: 200 }));
        }
        if (url === "/api/review/cards/c1") {
          return Promise.resolve(
            new Response(
              JSON.stringify({ cardId: "c1", userId: "u1", due: "2026-01-05T00:00:00Z", stability: 2.3, difficulty: 2.1, reps: 1, lapses: 0, lastReviewedAt: "2026-01-01T00:00:00Z" }),
              { status: 200 },
            ),
          );
        }
        if (url.includes("/progress")) return Promise.resolve(new Response(JSON.stringify({ mastered: 0, total: 0, nextDueDate: null }), { status: 200 }));
        throw new Error(`unexpected fetch: ${url}`);
      }),
    );

    const queryClient = renderScreen();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    expect(await screen.findByText("Que produit la photosynthèse ?")).toBeInTheDocument();
    expect(screen.queryByText("De l'oxygène")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /révéler la réponse/i }));
    expect(screen.getByText("De l'oxygène")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /correct/i }));

    expect(await screen.findByText(/tu as terminé cette session/i)).toBeInTheDocument();
    expect(calls.find((c) => c.url === "/api/review/cards/c1")?.body).toMatchObject({ rating: 3 });
    // Recap: how many fiches were reviewed this session (mastery itself
    // doesn't move in one session, docs: give a sense of progress anyway).
    expect(screen.getByText(/tu as revu 1 fiche/i)).toBeInTheDocument();
    // Defensive invalidation (item 5): progress and notions-progress must
    // be refetched after a rating, not just notions/review-session keys.
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["progress", "doc-1"] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["notions-progress", "doc-1"] });
  });

  it("completion recap: shows the next due date when it is available", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-08-28T10:00:00.000Z"));
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        if (url === "/api/review/sessions") return Promise.resolve(new Response(JSON.stringify({ sessionId: "s1", cards: [aDueCard] }), { status: 200 }));
        if (url === "/api/review/cards/c1") {
          return Promise.resolve(
            new Response(JSON.stringify({ cardId: "c1", userId: "u1", due: "2026-01-05T00:00:00Z", stability: 2.3, difficulty: 2.1, reps: 1, lapses: 0, lastReviewedAt: "2026-01-01T00:00:00Z" }), { status: 200 }),
          );
        }
        if (url.includes("/progress")) return Promise.resolve(new Response(JSON.stringify({ mastered: 0, total: 1, nextDueDate: "2026-03-05T00:00:00.000Z" }), { status: 200 }));
        throw new Error(`unexpected fetch: ${url}`);
      }),
    );

    renderScreen();
    await screen.findByText("Que produit la photosynthèse ?");
    await user.click(screen.getByRole("button", { name: /révéler la réponse/i }));
    await user.click(screen.getByRole("button", { name: /correct/i }));

    await screen.findByText(/tu as terminé cette session/i);
    expect(await screen.findByText(/5 mars 2026/i)).toBeInTheDocument();
  });

  it("ready state: shows 'Nouvelle fiche' for a card that has never been scheduled", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        if (url.includes("/progress")) return Promise.resolve(new Response(JSON.stringify({ mastered: 0, total: 0, nextDueDate: null }), { status: 200 }));
        return Promise.resolve(new Response(JSON.stringify({ sessionId: "s1", cards: [aDueCard] }), { status: 200 }));
      }),
    );

    renderScreen();

    expect(await screen.findByText(/nouvelle fiche/i)).toBeInTheDocument();
  });

  it("ready state: shows the card's current due date, formatted in French, and a mastered badge", async () => {
    const scheduledCard = {
      ...aDueCard,
      mastered: true,
      schedule: { cardId: "c1", userId: "u1", due: "2026-03-05T00:00:00.000Z", stability: 25, difficulty: 2.1, reps: 4, lapses: 0, lastReviewedAt: "2026-02-01T00:00:00Z" },
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        if (url.includes("/progress")) return Promise.resolve(new Response(JSON.stringify({ mastered: 0, total: 0, nextDueDate: null }), { status: 200 }));
        return Promise.resolve(new Response(JSON.stringify({ sessionId: "s1", cards: [scheduledCard] }), { status: 200 }));
      }),
    );

    renderScreen();

    expect(await screen.findByText(/5 mars 2026/i)).toBeInTheDocument();
    expect(screen.getByText("Maîtrisée")).toBeInTheDocument();
  });

  it("starts the session scoped to a single notion when a notionId is given", async () => {
    const calls: unknown[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string, init?: RequestInit) => {
        calls.push(init?.body ? JSON.parse(init.body as string) : undefined);
        return Promise.resolve(new Response(JSON.stringify({ sessionId: "s1", cards: [] }), { status: 200 }));
      }),
    );

    renderScreen({ notionId: "n1" });
    await screen.findByText(/tout est à jour/i);

    expect(calls).toContainEqual({ documentId: "doc-1", notionId: "n1" });
  });

  it("never shows a countdown or urgency copy while reviewing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        if (url.includes("/progress")) return Promise.resolve(new Response(JSON.stringify({ mastered: 0, total: 0, nextDueDate: null }), { status: 200 }));
        return Promise.resolve(new Response(JSON.stringify({ sessionId: "s1", cards: [aDueCard] }), { status: 200 }));
      }),
    );

    renderScreen();
    await screen.findByText("Que produit la photosynthèse ?");

    expect(screen.queryByText(/temps restant|dépêche|urgent/i)).not.toBeInTheDocument();
  });
});
