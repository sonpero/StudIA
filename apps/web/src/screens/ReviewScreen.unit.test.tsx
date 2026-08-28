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
  });

  it("loading state: shows a skeleton while the session is starting", () => {
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(new Promise(() => {})));

    renderScreen();

    expect(screen.getByText("Révision")).toBeInTheDocument();
    expect(screen.queryByText(/rien à réviser/i)).not.toBeInTheDocument();
  });

  it("error state: shows the confused mascot and a retry action", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 500 })));

    renderScreen();

    expect(await screen.findByText(/impossible de démarrer la révision/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /réessayer/i })).toBeInTheDocument();
  });

  it("empty state: nothing due, sleeping mascot, no urgency copy", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ sessionId: "s1", cards: [] }), { status: 200 })),
    );

    renderScreen();

    expect(await screen.findByText(/rien à réviser pour l'instant/i)).toBeInTheDocument();
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
        throw new Error(`unexpected fetch: ${url}`);
      }),
    );

    renderScreen();
    expect(await screen.findByText("Que produit la photosynthèse ?")).toBeInTheDocument();
    expect(screen.queryByText("De l'oxygène")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /révéler la réponse/i }));
    expect(screen.getByText("De l'oxygène")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /correct/i }));

    expect(await screen.findByText(/tu as terminé cette session/i)).toBeInTheDocument();
    expect(calls.find((c) => c.url === "/api/review/cards/c1")?.body).toMatchObject({ rating: 3 });
  });

  it("ready state: shows 'Nouvelle fiche' for a card that has never been scheduled", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ sessionId: "s1", cards: [aDueCard] }), { status: 200 })),
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
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ sessionId: "s1", cards: [scheduledCard] }), { status: 200 })),
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
    await screen.findByText(/rien à réviser pour l'instant/i);

    expect(calls).toContainEqual({ documentId: "doc-1", notionId: "n1" });
  });

  it("never shows a countdown or urgency copy while reviewing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ sessionId: "s1", cards: [aDueCard] }), { status: 200 })),
    );

    renderScreen();
    await screen.findByText("Que produit la photosynthèse ?");

    expect(screen.queryByText(/temps restant|dépêche|urgent/i)).not.toBeInTheDocument();
  });
});
