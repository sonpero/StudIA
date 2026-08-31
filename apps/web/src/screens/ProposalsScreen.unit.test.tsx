// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProposalsScreen } from "./ProposalsScreen.js";
import type { ProposalsView } from "../lib/proposals-api.js";

function renderScreen(onBack: () => void = () => undefined) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <ProposalsScreen jobId="job-1" onBack={onBack} />
    </QueryClientProvider>,
  );
}

function stubFetch(handlers: Record<string, () => Response>) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      const key = `${init?.method ?? "GET"} ${new URL(url, "http://localhost").pathname}`;
      const handler = handlers[key];
      if (!handler) throw new Error(`unhandled request: ${key}`);
      return Promise.resolve(handler());
    }),
  );
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

const runningView: ProposalsView = { status: "running", lastError: null, proposals: [] };
const emptyDoneView: ProposalsView = { status: "done", lastError: null, proposals: [] };
const failedView: ProposalsView = { status: "failed", lastError: "La photo est trop floue pour être lue.", proposals: [] };
const readyView: ProposalsView = {
  status: "done",
  lastError: null,
  proposals: [
    { id: "p1", jobId: "job-1", label: "Rendre le devoir de maths", dueDate: "2026-03-10", subjectHint: "Maths", createdAt: "2026-03-01T00:00:00.000Z" },
    { id: "p2", jobId: "job-1", label: "Réviser le contrôle d'histoire", dueDate: "2026-03-12", subjectHint: "Histoire", createdAt: "2026-03-01T00:00:00.000Z" },
  ],
};

describe("ProposalsScreen", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("loading state: shows a skeleton, never a bare spinner", () => {
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(new Promise(() => {})));
    renderScreen();
    expect(screen.getByRole("heading", { name: /propositions/i })).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("error state: a network failure shows the confused mascot and a retry button, never a raw error code", async () => {
    stubFetch({ "GET /api/todos/proposals/job-1": () => new Response(null, { status: 500 }) });
    renderScreen();
    await screen.findByText(/impossible de charger/i);
    expect(screen.getByRole("button", { name: /réessayer/i })).toBeInTheDocument();
  });

  it("still extracting: a plain in-progress message, not the empty-result or failure state", async () => {
    stubFetch({ "GET /api/todos/proposals/job-1": () => jsonResponse(runningView) });
    renderScreen();
    await screen.findByText(/extraction en cours/i);
    expect(screen.queryByText(/aucun devoir/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/trop floue/i)).not.toBeInTheDocument();
  });

  it("done with zero proposals: a legitimate result, not an error — invites closing, never a bare '0'", async () => {
    stubFetch({ "GET /api/todos/proposals/job-1": () => jsonResponse(emptyDoneView) });
    renderScreen();
    await screen.findByText(/aucun devoir trouvé/i);
    expect(screen.queryByText(/^0$/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /fermer/i })).toBeInTheDocument();
  });

  it("failed: shows the extractor's own readable reason, never a raw error code", async () => {
    stubFetch({ "GET /api/todos/proposals/job-1": () => jsonResponse(failedView) });
    renderScreen();
    await screen.findByText("La photo est trop floue pour être lue.");
    expect(screen.queryByText(/model-error/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /fermer/i })).toBeInTheDocument();
  });

  it("closing a failed extraction rejects the job (cleans up the file) and calls onBack", async () => {
    const onBack = vi.fn();
    const calls: string[] = [];
    stubFetch({
      "GET /api/todos/proposals/job-1": () => jsonResponse(failedView),
      "POST /api/todos/proposals/job-1/reject": () => {
        calls.push("reject");
        return new Response(null, { status: 204 });
      },
    });
    const user = userEvent.setup();
    renderScreen(onBack);
    await screen.findByText("La photo est trop floue pour être lue.");

    await user.click(screen.getByRole("button", { name: /fermer/i }));

    expect(calls).toEqual(["reject"]);
    expect(onBack).toHaveBeenCalled();
  });

  it("ready: lists every proposal, checked by default, showing subject only as a hint — never a course-selection control", async () => {
    stubFetch({ "GET /api/todos/proposals/job-1": () => jsonResponse(readyView) });
    renderScreen();
    await screen.findByText("Rendre le devoir de maths");

    expect(screen.getByText(/Réviser le contrôle d'histoire/)).toBeInTheDocument();
    expect(screen.getByText(/Maths/)).toBeInTheDocument();
    const checkboxes = screen.getAllByRole("checkbox");
    expect(checkboxes).toHaveLength(2);
    for (const checkbox of checkboxes) expect(checkbox).toBeChecked();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /cours/i })).not.toBeInTheDocument();
  });

  it("confirming sends only the checked ids and calls onBack", async () => {
    const onBack = vi.fn();
    let confirmedBody: unknown;
    const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      const key = `${init?.method ?? "GET"} ${new URL(url, "http://localhost").pathname}`;
      if (key === "POST /api/todos/proposals/job-1/confirm") {
        confirmedBody = JSON.parse(init!.body as string);
        return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
      }
      return Promise.resolve(jsonResponse(readyView));
    });
    vi.stubGlobal("fetch", fetchMock);

    const user = userEvent.setup();
    renderScreen(onBack);
    await screen.findByText("Rendre le devoir de maths");

    await user.click(screen.getAllByRole("checkbox")[1]!); // uncheck the second proposal
    await user.click(screen.getByRole("button", { name: /^confirmer/i }));

    expect(confirmedBody).toEqual({ accepted: ["p1"] });
    expect(onBack).toHaveBeenCalled();
  });

  it("rejecting everything calls reject, not confirm, and calls onBack", async () => {
    const onBack = vi.fn();
    const calls: string[] = [];
    stubFetch({
      "GET /api/todos/proposals/job-1": () => jsonResponse(readyView),
      "POST /api/todos/proposals/job-1/reject": () => {
        calls.push("reject");
        return new Response(null, { status: 204 });
      },
    });
    const user = userEvent.setup();
    renderScreen(onBack);
    await screen.findByText("Rendre le devoir de maths");

    await user.click(screen.getByRole("button", { name: /tout rejeter/i }));

    expect(calls).toEqual(["reject"]);
    expect(onBack).toHaveBeenCalled();
  });

  it("no mascot when proposals are ready to review: this is a data-dense list (docs/UI.md)", async () => {
    stubFetch({ "GET /api/todos/proposals/job-1": () => jsonResponse(readyView) });
    renderScreen();
    await screen.findByText("Rendre le devoir de maths");
    expect(document.querySelectorAll("svg[data-testid='mascot']")).toHaveLength(0);
  });
});
