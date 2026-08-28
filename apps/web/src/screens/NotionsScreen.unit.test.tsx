// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NotionsScreen } from "./NotionsScreen.js";

function renderScreen() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <NotionsScreen documentId="doc-1" onBack={() => undefined} onReview={() => undefined} />
    </QueryClientProvider>,
  );
}

const aNotion = { id: "n1", documentId: "doc-1", userId: "u1", title: "Photosynthèse", body: "La plante capte la lumière.", difficulty: "medium" as const, position: 0, createdAt: "2026-01-01T00:00:00Z" };

describe("NotionsScreen", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("loading state: shows skeleton placeholders while notions are being fetched", () => {
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(new Promise(() => {})));

    renderScreen();

    expect(screen.getByText("Notions du cours")).toBeInTheDocument();
    expect(screen.queryByText(/pas encore été créées/i)).not.toBeInTheDocument();
  });

  it("error state: shows the confused mascot and an explicit message, with a retry action", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 500 })));

    renderScreen();

    expect(await screen.findByText(/impossible de charger les notions/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /réessayer/i })).toBeInTheDocument();
  });

  it("empty state: invites the user back, never 'aucun résultat'", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify([]), { status: 200 })));

    renderScreen();

    expect(await screen.findByText(/pas encore été créées/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /retour à mes cours/i })).toBeInTheDocument();
    expect(screen.queryByText(/^aucun résultat$/i)).not.toBeInTheDocument();
  });

  it("ready state: lists the document's notions with their difficulty, and shows progress", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        if (url.includes("/notions-progress")) return Promise.resolve(new Response(JSON.stringify([{ notionId: "n1", masteredCards: 1, totalCards: 4 }]), { status: 200 }));
        if (url.includes("/progress")) return Promise.resolve(new Response(JSON.stringify({ mastered: 2, total: 5 }), { status: 200 }));
        return Promise.resolve(new Response(JSON.stringify([aNotion]), { status: 200 }));
      }),
    );

    renderScreen();

    expect(await screen.findByText("Photosynthèse")).toBeInTheDocument();
    expect(screen.getByText("Moyen")).toBeInTheDocument();
    expect(await screen.findByText("2 / 5 notions maîtrisées")).toBeInTheDocument();
  });

  it("ready state: offers a way back to the courses list (not just the empty/error states)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        if (url.includes("/notions-progress")) return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
        if (url.includes("/progress")) return Promise.resolve(new Response(JSON.stringify({ mastered: 0, total: 1 }), { status: 200 }));
        return Promise.resolve(new Response(JSON.stringify([aNotion]), { status: 200 }));
      }),
    );
    const user = userEvent.setup();
    const onBack = vi.fn();
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <NotionsScreen documentId="doc-1" onBack={onBack} onReview={() => undefined} />
      </QueryClientProvider>,
    );
    await screen.findByText("Photosynthèse");

    await user.click(screen.getByRole("button", { name: /retour à mes cours/i }));

    expect(onBack).toHaveBeenCalled();
  });

  it("ready state: shows each notion's own mastery progress, with a distinct label when it has no cards yet", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        if (url.includes("/notions-progress")) return Promise.resolve(new Response(JSON.stringify([{ notionId: "n1", masteredCards: 1, totalCards: 4 }]), { status: 200 }));
        if (url.includes("/progress")) return Promise.resolve(new Response(JSON.stringify({ mastered: 0, total: 1 }), { status: 200 }));
        return Promise.resolve(new Response(JSON.stringify([aNotion]), { status: 200 }));
      }),
    );

    renderScreen();

    expect(await screen.findByText("1 / 4 fiches maîtrisées")).toBeInTheDocument();
  });

  it("ready state: a notion with no cards yet shows an inviting label, not a 0/0 count", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        if (url.includes("/notions-progress")) return Promise.resolve(new Response(JSON.stringify([{ notionId: "n1", masteredCards: 0, totalCards: 0 }]), { status: 200 }));
        if (url.includes("/progress")) return Promise.resolve(new Response(JSON.stringify({ mastered: 0, total: 1 }), { status: 200 }));
        return Promise.resolve(new Response(JSON.stringify([aNotion]), { status: 200 }));
      }),
    );

    renderScreen();

    expect(await screen.findByText("Pas encore de fiches")).toBeInTheDocument();
    expect(screen.queryByText(/^0 \/ 0/)).not.toBeInTheDocument();
  });

  it("ready state: the notion's body is hidden by default and revealed on demand", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        if (url.includes("/notions-progress")) return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
        if (url.includes("/progress")) return Promise.resolve(new Response(JSON.stringify({ mastered: 0, total: 1 }), { status: 200 }));
        return Promise.resolve(new Response(JSON.stringify([aNotion]), { status: 200 }));
      }),
    );
    const user = userEvent.setup();

    renderScreen();
    await screen.findByText("Photosynthèse");
    expect(screen.queryByText("La plante capte la lumière.")).not.toBeInTheDocument();

    await user.click(screen.getByText("Voir le contenu"));

    expect(screen.getByText("La plante capte la lumière.")).toBeInTheDocument();
  });

  it("clicking 'Réviser cette notion' starts a review scoped to that notion", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        if (url.includes("/notions-progress")) return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
        if (url.includes("/progress")) return Promise.resolve(new Response(JSON.stringify({ mastered: 0, total: 1 }), { status: 200 }));
        return Promise.resolve(new Response(JSON.stringify([aNotion]), { status: 200 }));
      }),
    );
    const user = userEvent.setup();
    const onReview = vi.fn();
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <NotionsScreen documentId="doc-1" onBack={() => undefined} onReview={onReview} />
      </QueryClientProvider>,
    );
    await screen.findByText("Photosynthèse");

    await user.click(screen.getByRole("button", { name: /réviser cette notion/i }));

    expect(onReview).toHaveBeenCalledWith("n1");
  });

  it("polls while there are no notions yet, and shows them once splitting finishes", async () => {
    let notionsCallCount = 0;
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/notions-progress")) return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
      if (url.includes("/progress")) return Promise.resolve(new Response(JSON.stringify({ mastered: 0, total: 0 }), { status: 200 }));
      notionsCallCount += 1;
      // Empty at first (splitting still running), then populated — proves
      // the screen keeps polling instead of getting stuck on "empty"
      // forever (docs/UI.md: never block the UI on a job).
      const body = notionsCallCount === 1 ? [] : [aNotion];
      return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
    });
    vi.stubGlobal("fetch", fetchMock);

    renderScreen();

    await screen.findByText(/pas encore été créées/i);
    await waitFor(() => expect(notionsCallCount).toBeGreaterThan(1), { timeout: 4000 });
    expect(await screen.findByText("Photosynthèse")).toBeInTheDocument();
  });

  it("requesting generation calls the whole-document generate endpoint", async () => {
    const user = userEvent.setup();
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string, init?: RequestInit) => {
        calls.push(`${init?.method ?? "GET"} ${url}`);
        if (url.includes("/notions-progress")) return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
        if (url.includes("/progress")) return Promise.resolve(new Response(JSON.stringify({ mastered: 0, total: 1 }), { status: 200 }));
        if (url.includes("/generation-status")) return Promise.resolve(new Response(JSON.stringify({ done: 1, total: 1, failed: 0 }), { status: 200 }));
        if (url.includes("/generate")) return Promise.resolve(new Response(JSON.stringify({ jobIds: ["j1"] }), { status: 202 }));
        return Promise.resolve(new Response(JSON.stringify([aNotion]), { status: 200 }));
      }),
    );

    renderScreen();
    await screen.findByText("Photosynthèse");
    await user.click(screen.getByRole("button", { name: /créer les fiches/i }));

    expect(calls).toContainEqual("POST /api/documents/doc-1/generate");
  });

  it("generation: disables the button and shows an in-progress state while cards are being created", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        if (url.includes("/notions-progress")) return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
        if (url.includes("/progress")) return Promise.resolve(new Response(JSON.stringify({ mastered: 0, total: 1 }), { status: 200 }));
        // Never resolves "done": the status stays in progress for the
        // whole test, so the loading state is observable, not a flash.
        if (url.includes("/generation-status")) return Promise.resolve(new Response(JSON.stringify({ done: 1, total: 3, failed: 0 }), { status: 200 }));
        if (url.includes("/generate")) return Promise.resolve(new Response(JSON.stringify({ jobIds: ["j1", "j2", "j3"] }), { status: 202 }));
        return Promise.resolve(new Response(JSON.stringify([aNotion]), { status: 200 }));
      }),
    );

    renderScreen();
    await screen.findByText("Photosynthèse");
    await user.click(screen.getByRole("button", { name: /créer les fiches/i }));

    expect(await screen.findByText(/création en cours/i)).toBeInTheDocument();
    expect(await screen.findByText(/1 \/ 3/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /création en cours/i })).toBeDisabled();
  });

  it("generation: tracks progress via generation-status and invalidates notions/progress once done", async () => {
    const user = userEvent.setup();
    let statusCalls = 0;
    let notionsProgressCalls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        if (url.includes("/notions-progress")) {
          notionsProgressCalls += 1;
          return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
        }
        if (url.includes("/progress")) return Promise.resolve(new Response(JSON.stringify({ mastered: 0, total: 1 }), { status: 200 }));
        if (url.includes("/generation-status")) {
          statusCalls += 1;
          const body = statusCalls === 1 ? { done: 1, total: 3, failed: 0 } : { done: 3, total: 3, failed: 0 };
          return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
        }
        if (url.includes("/generate")) return Promise.resolve(new Response(JSON.stringify({ jobIds: ["j1", "j2", "j3"] }), { status: 202 }));
        return Promise.resolve(new Response(JSON.stringify([aNotion]), { status: 200 }));
      }),
    );

    renderScreen();
    await screen.findByText("Photosynthèse");
    const notionsProgressCallsBefore = notionsProgressCalls;
    await user.click(screen.getByRole("button", { name: /créer les fiches/i }));

    expect(await screen.findByText(/1 \/ 3/)).toBeInTheDocument();
    // Once done/total match, the button returns to normal and the
    // notions-progress query (consumed by every notion's mastery label)
    // gets invalidated, proving the refresh actually happened.
    await waitFor(() => expect(screen.getByRole("button", { name: /créer les fiches/i })).not.toBeDisabled(), { timeout: 4000 });
    await waitFor(() => expect(notionsProgressCalls).toBeGreaterThan(notionsProgressCallsBefore), { timeout: 4000 });
  });

  it("generation: shows an error and re-enables the button if starting generation fails", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        if (url.includes("/notions-progress")) return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
        if (url.includes("/progress")) return Promise.resolve(new Response(JSON.stringify({ mastered: 0, total: 1 }), { status: 200 }));
        if (url.includes("/generate")) return Promise.resolve(new Response(null, { status: 500 }));
        return Promise.resolve(new Response(JSON.stringify([aNotion]), { status: 200 }));
      }),
    );

    renderScreen();
    await screen.findByText("Photosynthèse");
    await user.click(screen.getByRole("button", { name: /créer les fiches/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/impossible de créer les fiches/i);
    expect(screen.getByRole("button", { name: /créer les fiches/i })).not.toBeDisabled();
  });

  it("generation: renames the button to 'Régénérer les fiches' once every notion already has cards", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        if (url.includes("/notions-progress")) return Promise.resolve(new Response(JSON.stringify([{ notionId: "n1", masteredCards: 1, totalCards: 3 }]), { status: 200 }));
        if (url.includes("/progress")) return Promise.resolve(new Response(JSON.stringify({ mastered: 0, total: 1 }), { status: 200 }));
        return Promise.resolve(new Response(JSON.stringify([aNotion]), { status: 200 }));
      }),
    );

    renderScreen();

    expect(await screen.findByRole("button", { name: /régénérer les fiches/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^créer les fiches$/i })).not.toBeInTheDocument();
  });
});
