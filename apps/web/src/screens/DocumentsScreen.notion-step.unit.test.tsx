// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import type { DocumentSummary } from "@studia/contracts";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DocumentsScreen } from "./DocumentsScreen.js";

// The notion step's own status (GET /api/notions/statuses, content module):
// a course whose extraction is done can still be creating its notions, or
// have failed to — Mes cours must say so instead of looking ready, and
// offer a retry of that step only (POST /api/documents/:id/notions/retry),
// never the extraction's own POST /api/documents/:id/retry.
type NotionStepStatus = "pending" | "ready" | "failed";

const aDocument: DocumentSummary = { id: "d1", title: "Chapitre 3", sourceType: "pdf", status: "done", pageCount: 3, colour: "#F87171", createdAt: "2026-01-01T00:00:00Z" };
const emptyToday = { date: "2026-09-06", dueCards: [], notionsBelowTarget: [], todos: [], upcomingDeadlines: [], streak: 0 };

function renderScreen() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <DocumentsScreen onOpenReader={() => undefined} onReviewCourse={() => undefined} />
    </QueryClientProvider>,
  );
}

function stubFetch(options: {
  documents?: DocumentSummary[];
  statuses: () => { documentId: string; status: NotionStepStatus }[];
  progressTotal?: () => number;
  retry?: () => Response;
}) {
  const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
    if (url === "/api/notions/statuses") return Promise.resolve(new Response(JSON.stringify(options.statuses()), { status: 200 }));
    if (/\/notions\/retry$/.test(url) && init?.method === "POST") return Promise.resolve(options.retry?.() ?? new Response(JSON.stringify({ jobId: "j" }), { status: 202 }));
    if (/\/api\/documents\/[^/]+\/progress/.test(url)) {
      const total = options.progressTotal?.() ?? 0;
      return Promise.resolve(new Response(JSON.stringify({ mastered: 0, total, nextDueDate: null }), { status: 200 }));
    }
    if (url.startsWith("/api/today")) return Promise.resolve(new Response(JSON.stringify(emptyToday), { status: 200 }));
    if (url.startsWith("/api/documents")) return Promise.resolve(new Response(JSON.stringify(options.documents ?? [aDocument]), { status: 200 }));
    return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("DocumentsScreen — notion step", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("a course whose notions are still being created says so, instead of looking ready", async () => {
    stubFetch({ statuses: () => [{ documentId: "d1", status: "pending" }] });

    renderScreen();

    const card = await screen.findByTestId("document-card");
    expect(await within(card).findByText("Création des notions…")).toBeInTheDocument();
    expect(within(card).queryByRole("button", { name: "Réessayer" })).not.toBeInTheDocument();
  });

  it("a course whose notion creation failed shows a plain message and a 'Réessayer', never the raw error", async () => {
    stubFetch({ statuses: () => [{ documentId: "d1", status: "failed" }] });

    renderScreen();

    const card = await screen.findByTestId("document-card");
    expect(await within(card).findByText(/les notions de ce cours n'ont pas pu être créées/i)).toBeInTheDocument();
    expect(within(card).getByRole("button", { name: "Réessayer" })).toBeInTheDocument();
    // The extracted course stays readable: only the notion step failed.
    expect(within(card).getByRole("button", { name: "Lire le cours" })).toBeInTheDocument();
  });

  it("'Réessayer' relaunches notion creation only, not the extraction, then shows the step as in progress", async () => {
    let status: NotionStepStatus = "failed";
    const fetchMock = stubFetch({
      statuses: () => [{ documentId: "d1", status }],
      retry: () => {
        status = "pending";
        return new Response(JSON.stringify({ jobId: "j" }), { status: 202 });
      },
    });

    renderScreen();
    const card = await screen.findByTestId("document-card");
    await userEvent.click(await within(card).findByRole("button", { name: "Réessayer" }));

    expect(fetchMock).toHaveBeenCalledWith("/api/documents/d1/notions/retry", expect.objectContaining({ method: "POST" }));
    expect(fetchMock).not.toHaveBeenCalledWith("/api/documents/d1/retry", expect.anything());
    expect(await within(card).findByText("Création des notions…")).toBeInTheDocument();
  });

  it("if the retry itself cannot be sent, says so plainly", async () => {
    stubFetch({ statuses: () => [{ documentId: "d1", status: "failed" }], retry: () => new Response(null, { status: 500 }) });

    renderScreen();
    const card = await screen.findByTestId("document-card");
    await userEvent.click(await within(card).findByRole("button", { name: "Réessayer" }));

    expect(await within(card).findByRole("alert")).toHaveTextContent(/impossible de relancer la création des notions/i);
  });

  it("polls the notion step while it is in progress, and shows the course's notions once ready", async () => {
    let calls = 0;
    stubFetch({
      statuses: () => {
        calls += 1;
        return [{ documentId: "d1", status: calls === 1 ? "pending" : "ready" }];
      },
      progressTotal: () => (calls > 1 ? 5 : 0),
    });

    renderScreen();

    const card = await screen.findByTestId("document-card");
    await within(card).findByText("Création des notions…");
    await waitFor(() => expect(within(card).getByText(/5 notions/)).toBeInTheDocument(), { timeout: 4000 });
    expect(within(card).queryByText("Création des notions…")).not.toBeInTheDocument();
  });

  it("a failed latest split does not hide notions the course already has (no retry offered over them)", async () => {
    stubFetch({ statuses: () => [{ documentId: "d1", status: "failed" }], progressTotal: () => 7 });

    renderScreen();

    const card = await screen.findByTestId("document-card");
    expect(await within(card).findByText(/7 notions/)).toBeInTheDocument();
    expect(within(card).queryByText(/n'ont pas pu être créées/i)).not.toBeInTheDocument();
    expect(within(card).queryByRole("button", { name: "Réessayer" })).not.toBeInTheDocument();
  });
});
