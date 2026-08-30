// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ReaderScreen } from "./ReaderScreen.js";

function renderScreen(onBack: () => void = () => undefined) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <ReaderScreen documentId="doc-1" onBack={onBack} />
    </QueryClientProvider>,
  );
}

function stubFetch(response: Record<string, unknown> | (() => Response)) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation(() => {
      if (typeof response === "function") return Promise.resolve(response());
      return Promise.resolve(new Response(JSON.stringify(response), { status: 200 }));
    }),
  );
}

const doneBase = {
  id: "doc-1",
  title: "La photosynthèse",
  sourceType: "photo",
  pageCount: 2,
  colour: "#F87171",
  createdAt: "2026-01-01T00:00:00Z",
  lastError: null,
};

describe("ReaderScreen", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("loading state: shows a skeleton, never a bare spinner", () => {
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(new Promise(() => {})));
    renderScreen();
    expect(screen.getByRole("heading", { name: "Lecture" })).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("error state: a network failure shows the confused mascot and a retry button, never a raw error code", async () => {
    stubFetch(() => new Response(null, { status: 500 }));
    renderScreen();
    await screen.findByText(/impossible de charger ce cours/i);
    expect(screen.getByRole("button", { name: /réessayer/i })).toBeInTheDocument();
  });

  it("still extracting (pending or running): the reading mascot, a plain wait message, and polling — not left undefined just because the entry button is normally gated on status === done", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ...doneBase, status: "running", markdown: null }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    renderScreen();

    await screen.findByText(/encore en cours de lecture/i);
    expect(screen.getByRole("button", { name: "Retour" })).toBeInTheDocument();

    const initialCalls = fetchMock.mock.calls.length;
    await waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThan(initialCalls), { timeout: 4000 });
  });

  it("failed extraction: the confused mascot, a sober fact, no retry button here — that mutation stays on Mes cours", async () => {
    stubFetch({ ...doneBase, status: "failed", markdown: null });
    renderScreen();

    await screen.findByText(/la lecture de ce cours a échoué/i);
    expect(screen.queryByRole("button", { name: /réessayer/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retour" })).toBeInTheDocument();
  });

  it("done but nothing readable (markdown null): the idle mascot, not a blank page", async () => {
    stubFetch({ ...doneBase, status: "done", markdown: null });
    renderScreen();

    await screen.findByText(/ne contient pas encore de texte lisible/i);
    expect(screen.getByRole("button", { name: "Retour" })).toBeInTheDocument();
  });

  it("done but nothing readable (markdown blank): same empty state as null, not a rendering crash", async () => {
    stubFetch({ ...doneBase, status: "done", markdown: "   " });
    renderScreen();

    await screen.findByText(/ne contient pas encore de texte lisible/i);
  });

  it("ready: renders the course's extracted markdown as formatted text, not raw preformatted", async () => {
    stubFetch({ ...doneBase, status: "done", markdown: "## Une section\n\nLa plante **capte** la lumière." });
    renderScreen();

    const heading = await screen.findByRole("heading", { name: "Une section" });
    expect(heading).toBeInTheDocument();
    const strong = await screen.findByText("capte");
    expect(strong.tagName).toBe("STRONG");
    // Raw markdown syntax must not leak through as literal characters.
    expect(screen.queryByText(/##/)).not.toBeInTheDocument();
    expect(screen.queryByText(/\*\*/)).not.toBeInTheDocument();
  });

  it("ready: the course title heading is distinct from the document's own markdown headings", async () => {
    stubFetch({ ...doneBase, status: "done", markdown: "# Chapitre premier\n\nContenu." });
    renderScreen();

    expect(await screen.findByRole("heading", { name: "La photosynthèse" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Chapitre premier" })).toBeInTheDocument();
  });

  it("ready: shows the course's own subject colour, no mascot — this is a data-dense view", async () => {
    stubFetch({ ...doneBase, status: "done", markdown: "Contenu du cours." });
    renderScreen();

    await screen.findByText("Contenu du cours.");
    expect(document.querySelectorAll("svg[aria-hidden='true']")).toHaveLength(0);
  });

  it("'Retour' calls onBack — deliberately destination-agnostic text, since this screen can now return to either Mes cours or Notions du cours depending on how it was reached (same idiom as ProgressScreen's own plain 'Retour')", async () => {
    const onBack = vi.fn();
    stubFetch({ ...doneBase, status: "done", markdown: "Contenu du cours." });
    const user = userEvent.setup();
    renderScreen(onBack);

    await screen.findByText("Contenu du cours.");
    await user.click(screen.getByRole("button", { name: "Retour" }));

    expect(onBack).toHaveBeenCalled();
  });
});
