// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DocumentsScreen } from "./DocumentsScreen.js";

function renderScreen(overrides: Partial<{ onOpenNotions: (documentId: string) => void; onOpenReader: (documentId: string) => void }> = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <DocumentsScreen onOpenNotions={overrides.onOpenNotions ?? (() => undefined)} onOpenReader={overrides.onOpenReader ?? (() => undefined)} />
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

  it("the gap between the title and what follows it is the same --space-section token in every state — loading, error and ready alike (docs/UI.md's Grid and spacing note)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(new Promise(() => {})));
    renderScreen();
    const loadingHeading = screen.getByText("Mes cours");
    expect(loadingHeading.className).toMatch(/mb-\[var\(--space-section\)\]/);
    cleanup();

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 500 })));
    renderScreen();
    await screen.findByText(/impossible de charger tes cours/i);
    const errorMain = screen.getByRole("heading", { name: "Mes cours" }).closest("main");
    expect(errorMain?.className).toMatch(/gap-\[var\(--space-section\)\]/);
    cleanup();

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify([]), { status: 200 })));
    renderScreen();
    await screen.findByText(/aucun cours/i);
    const readyHeading = screen.getByText("Mes cours");
    expect(readyHeading.className).toMatch(/mb-\[var\(--space-section\)\]/);
  });

  it("the document grid's own gutter is --space-block, cards being distinct blocks within one section (docs/UI.md's Grid and spacing note)", async () => {
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
    await screen.findByText("Chapitre 3");

    const grid = screen.getByTestId("document-card").closest(".grid") as HTMLElement;
    expect(grid.className).toMatch(/gap-\[var\(--space-block\)\]/);
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

  it("ready state: a course card's title is --text-title, up from the plain body size it shared with everything else before this pass (docs/UI.md's Type note)", async () => {
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

    const title = await screen.findByText("Chapitre 3");
    expect(title.className).toContain("text-[length:var(--text-title)]");
  });

  it("a done document offers to open the reader, calling back with its id — replacing the old inline 'Voir le texte' toggle", async () => {
    const user = userEvent.setup();
    const onOpenReader = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify([
            { id: "d1", title: "Chapitre 3", sourceType: "photo", status: "done", pageCount: 1, colour: "#F87171", createdAt: "2026-01-01T00:00:00Z" },
          ]),
          { status: 200 },
        ),
      ),
    );

    renderScreen({ onOpenReader });
    await screen.findByText("Chapitre 3");

    await user.click(screen.getByRole("button", { name: /lire le cours/i }));

    expect(onOpenReader).toHaveBeenCalledWith("d1");
    expect(screen.queryByRole("button", { name: /voir le texte/i })).not.toBeInTheDocument();
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

  it("a card's own 'Lire le cours', 'Voir les notions' and 'Réessayer' each pair a decorative icon with their label — the accessible name stays exactly the label (docs/UI.md's Icons note)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify([
            { id: "d1", title: "Chapitre 3", sourceType: "photo", status: "done", pageCount: 1, colour: "#F87171", createdAt: "2026-01-01T00:00:00Z" },
            { id: "d2", title: "Cours raté", sourceType: "photo", status: "failed", pageCount: 1, colour: "#F87171", createdAt: "2026-01-01T00:00:00Z" },
          ]),
          { status: 200 },
        ),
      ),
    );

    renderScreen();
    await screen.findByText("Chapitre 3");
    await screen.findByText("Cours raté");

    for (const name of ["Lire le cours", "Voir les notions", "Réessayer"]) {
      const button = screen.getByRole("button", { name });
      const icon = button.querySelector("svg");
      expect(icon).not.toBeNull();
      expect(icon).toHaveAttribute("aria-hidden", "true");
      expect(icon).toHaveAttribute("focusable", "false");
    }
  });

  it("a done document offers to open its notions, calling back with its id", async () => {
    const user = userEvent.setup();
    const onOpenNotions = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify([
            { id: "d1", title: "Chapitre 3", sourceType: "photo", status: "done", pageCount: 1, colour: "#F87171", createdAt: "2026-01-01T00:00:00Z" },
          ]),
          { status: 200 },
        ),
      ),
    );

    renderScreen({ onOpenNotions });
    await screen.findByText("Chapitre 3");

    await user.click(screen.getByRole("button", { name: /voir les notions/i }));

    expect(onOpenNotions).toHaveBeenCalledWith("d1");
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
