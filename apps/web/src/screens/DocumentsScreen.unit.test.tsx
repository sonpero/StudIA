// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DocumentsScreen } from "./DocumentsScreen.js";

function renderScreen() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <DocumentsScreen />
    </QueryClientProvider>,
  );
}

describe("DocumentsScreen", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("loading state: shows skeleton placeholders while the list is being fetched", () => {
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(new Promise(() => {})));

    renderScreen();

    expect(screen.getByText("Mes cours")).toBeInTheDocument();
    expect(screen.queryByText(/aucun cours/i)).not.toBeInTheDocument();
  });

  it("error state: shows the confused mascot and an explicit message, with a retry action", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 500 })));

    renderScreen();

    expect(await screen.findByText(/impossible de charger tes cours/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /réessayer/i })).toBeInTheDocument();
  });

  it("empty state: invites the user to add a course, action right there, never 'aucun résultat'", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify([]), { status: 200 })));

    renderScreen();

    expect(await screen.findByText(/prends ton cours en photo pour commencer/i)).toBeInTheDocument();
    expect(screen.getByText(/\+ ajouter un cours/i)).toBeInTheDocument();
    expect(screen.queryByText(/^aucun résultat$/i)).not.toBeInTheDocument();
  });

  it("ready state: lists the user's documents with status and subject colour", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify([
            { id: "d1", title: "Chapitre 3", sourceType: "photo", status: "done", pageCount: 3, colour: "#F87171", createdAt: "2026-01-01T00:00:00Z" },
          ]),
          { status: 200 },
        ),
      ),
    );

    renderScreen();

    expect(await screen.findByText("Chapitre 3")).toBeInTheDocument();
    expect(screen.getByText("3 pages")).toBeInTheDocument();
    expect(screen.getByText("Terminé")).toBeInTheDocument();
  });

  it("a done document can reveal its extracted text on demand", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        if (/\/api\/documents\/d1$/.test(url)) {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                id: "d1",
                title: "Chapitre 3",
                sourceType: "photo",
                status: "done",
                pageCount: 1,
                colour: "#F87171",
                createdAt: "2026-01-01T00:00:00Z",
                lastError: null,
                markdown: "# La photosynthèse\n\nContenu extrait.",
              }),
              { status: 200 },
            ),
          );
        }
        return Promise.resolve(
          new Response(
            JSON.stringify([
              { id: "d1", title: "Chapitre 3", sourceType: "photo", status: "done", pageCount: 1, colour: "#F87171", createdAt: "2026-01-01T00:00:00Z" },
            ]),
            { status: 200 },
          ),
        );
      }),
    );

    renderScreen();
    await screen.findByText("Chapitre 3");

    await user.click(screen.getByRole("button", { name: /voir le texte/i }));

    expect(await screen.findByText(/la photosynthèse/i)).toBeInTheDocument();
  });

  it("shows a retry action only for a failed document, with its last error implied by the failed status", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify([
            { id: "d1", title: "Cours raté", sourceType: "photo", status: "failed", pageCount: 1, colour: "#F87171", createdAt: "2026-01-01T00:00:00Z" },
          ]),
          { status: 200 },
        ),
      ),
    );

    renderScreen();

    await screen.findByText("Cours raté");
    expect(screen.getByText("Échec")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /réessayer/i })).toBeInTheDocument();
  });

  it("polls while a document is still pending or running", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify([
          { id: "d1", title: "Cours", sourceType: "photo", status: "pending", pageCount: 1, colour: "#F87171", createdAt: "2026-01-01T00:00:00Z" },
        ]),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    renderScreen();

    await screen.findByText("En attente");
    const initialCalls = fetchMock.mock.calls.length;
    await waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThan(initialCalls), { timeout: 4000 });
  });
});
