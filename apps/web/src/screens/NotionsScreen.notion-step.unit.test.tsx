// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import type { DocumentSummary } from "@studia/contracts";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NotionsScreen } from "./NotionsScreen.js";

// The notion step's own status on the Notions screen: an empty notion list
// is no longer always "reviens un peu plus tard" — in progress and failed
// are said as such, and a failure offers a notion-only retry.
type NotionStepStatus = "pending" | "ready" | "failed";

const docA: DocumentSummary = { id: "doc-1", title: "Biologie", sourceType: "pdf", status: "done", pageCount: 3, colour: "#F87171", createdAt: "2026-01-01T00:00:00Z" };
const aNotion = { id: "n1", documentId: "doc-1", userId: "u1", title: "Photosynthèse", body: "La plante capte la lumière.", difficulty: "medium" as const, position: 0, createdAt: "2026-01-01T00:00:00Z" };

function renderScreen() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <NotionsScreen onBack={() => undefined} onReview={() => undefined} onOpenProgress={() => undefined} onOpenReader={() => undefined} onOpenTutor={() => undefined} />
    </QueryClientProvider>,
  );
}

function stubFetch(options: { statuses: () => { documentId: string; status: NotionStepStatus }[]; notions?: () => (typeof aNotion)[]; retry?: () => Response }) {
  const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
    if (url === "/api/notions/statuses") return Promise.resolve(new Response(JSON.stringify(options.statuses()), { status: 200 }));
    if (/\/notions\/retry$/.test(url) && init?.method === "POST") return Promise.resolve(options.retry?.() ?? new Response(JSON.stringify({ jobId: "j" }), { status: 202 }));
    if (url.startsWith("/api/today")) {
      return Promise.resolve(new Response(JSON.stringify({ date: "2026-01-01", dueCards: [], notionsBelowTarget: [], todos: [], upcomingDeadlines: [], streak: 0 }), { status: 200 }));
    }
    if (/\/api\/documents\/[^/]+\/notions-progress/.test(url)) return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
    if (/\/api\/documents\/[^/]+\/progress/.test(url)) return Promise.resolve(new Response(JSON.stringify({ mastered: 0, total: 0, nextDueDate: null }), { status: 200 }));
    if (/\/api\/documents\/[^/]+\/notions$/.test(url)) return Promise.resolve(new Response(JSON.stringify(options.notions?.() ?? []), { status: 200 }));
    if (url.startsWith("/api/documents")) return Promise.resolve(new Response(JSON.stringify([docA]), { status: 200 }));
    return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("NotionsScreen — notion step", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("while notions are being created, says so instead of 'reviens un peu plus tard'", async () => {
    stubFetch({ statuses: () => [{ documentId: "doc-1", status: "pending" }] });

    renderScreen();

    expect(await screen.findByText(/création des notions en cours/i)).toBeInTheDocument();
    expect(screen.queryByText(/reviens un peu plus tard/i)).not.toBeInTheDocument();
  });

  it("a failed notion creation shows a plain message with the confused mascot and a 'Réessayer'", async () => {
    stubFetch({ statuses: () => [{ documentId: "doc-1", status: "failed" }] });

    renderScreen();

    expect(await screen.findByText(/les notions de ce cours n'ont pas pu être créées/i)).toBeInTheDocument();
    expect(screen.getByTestId("mascot")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Réessayer" })).toBeInTheDocument();
    expect(screen.queryByText(/reviens un peu plus tard/i)).not.toBeInTheDocument();
  });

  it("'Réessayer' relaunches notion creation only, and the notions show once created", async () => {
    let status: NotionStepStatus = "failed";
    const fetchMock = stubFetch({
      statuses: () => [{ documentId: "doc-1", status }],
      notions: () => (status === "ready" ? [aNotion] : []),
      retry: () => {
        status = "ready";
        return new Response(JSON.stringify({ jobId: "j" }), { status: 202 });
      },
    });

    renderScreen();
    await userEvent.click(await screen.findByRole("button", { name: "Réessayer" }));

    expect(fetchMock).toHaveBeenCalledWith("/api/documents/doc-1/notions/retry", expect.objectContaining({ method: "POST" }));
    expect(fetchMock).not.toHaveBeenCalledWith("/api/documents/doc-1/retry", expect.anything());
    expect(await screen.findByText("Photosynthèse", {}, { timeout: 4000 })).toBeInTheDocument();
  });

  it("if the retry itself cannot be sent, says so plainly", async () => {
    stubFetch({ statuses: () => [{ documentId: "doc-1", status: "failed" }], retry: () => new Response(null, { status: 500 }) });

    renderScreen();
    await userEvent.click(await screen.findByRole("button", { name: "Réessayer" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/impossible de relancer la création des notions/i);
  });

  it("notions the course already has are shown even if its latest split failed", async () => {
    stubFetch({ statuses: () => [{ documentId: "doc-1", status: "failed" }], notions: () => [aNotion] });

    renderScreen();

    expect(await screen.findByText("Photosynthèse")).toBeInTheDocument();
    expect(screen.queryByText(/n'ont pas pu être créées/i)).not.toBeInTheDocument();
  });

  // See DocumentsScreen's twin test: a 409 means this screen is stale.
  it("a retry refused because notions now exist shows them instead of blaming the connection", async () => {
    let notions: (typeof aNotion)[] = [];
    stubFetch({
      statuses: () => [{ documentId: "doc-1", status: "failed" }],
      notions: () => notions,
      retry: () => {
        notions = [aNotion];
        return new Response(JSON.stringify({ error: "has-notions" }), { status: 409 });
      },
    });

    renderScreen();
    await userEvent.click(await screen.findByRole("button", { name: "Réessayer" }));

    expect(await screen.findByText("Photosynthèse")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

