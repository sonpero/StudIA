// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PlanningScreen } from "./PlanningScreen.js";

function renderScreen() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <PlanningScreen documentId="doc-1" onBack={() => undefined} />
    </QueryClientProvider>,
  );
}

const aNotion = { id: "n1", documentId: "doc-1", userId: "u1", title: "Photosynthèse", body: "...", difficulty: "easy" as const, position: 0, createdAt: "2026-01-01T00:00:00Z" };

function stubFetch(planResponse: Response) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation((url: string) => {
      if (url.includes("/notions")) return Promise.resolve(new Response(JSON.stringify([aNotion]), { status: 200 }));
      if (url.includes("/plan")) return Promise.resolve(planResponse);
      return Promise.resolve(new Response(null, { status: 204 }));
    }),
  );
}

describe("PlanningScreen", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("loading state: shows a skeleton while the plan is loading", () => {
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(new Promise(() => {})));
    renderScreen();
    expect(screen.getByText("Planning")).toBeInTheDocument();
  });

  it("error state: a network failure shows a retry button", async () => {
    stubFetch(new Response(null, { status: 500 }));
    renderScreen();
    await screen.findByText(/impossible de charger le plan/i);
    expect(screen.getByRole("button", { name: /réessayer/i })).toBeInTheDocument();
  });

  it("empty (setup-needed) state: no availability yet prompts to set it, not a generic error", async () => {
    stubFetch(new Response(JSON.stringify({ error: "no-capacity" }), { status: 422 }));
    renderScreen();
    await screen.findByText(/indique combien de temps/i);
    expect(screen.getByText(/tes disponibilités/i)).toBeInTheDocument();
  });

  it("empty (setup-needed) state: no usable day prompts to change the deadline, not the availability form", async () => {
    stubFetch(new Response(JSON.stringify({ error: "no-usable-day" }), { status: 422 }));
    renderScreen();
    await screen.findByText(/aucun jour disponible/i);
    expect(screen.getByText(/^échéance$/i)).toBeInTheDocument();
  });

  it("ready state: a feasible plan renders its days and entries", async () => {
    const plan = { feasible: true, shortfallMinutes: 0, days: [{ date: "2026-04-01", estimatedMinutes: 8, entries: [{ kind: "learn", notionId: "n1", estimatedMinutes: 8 }] }] };
    stubFetch(new Response(JSON.stringify(plan), { status: 200 }));
    renderScreen();
    await screen.findByText("Photosynthèse", { exact: false });
    expect(screen.queryByText(/il manque environ/i)).not.toBeInTheDocument();
  });

  it("ready state: an infeasible plan shows the shortfall, plainly, not as an error", async () => {
    const plan = { feasible: false, shortfallMinutes: 42, days: [{ date: "2026-04-01", estimatedMinutes: 8, entries: [{ kind: "learn", notionId: "n1", estimatedMinutes: 8 }] }] };
    stubFetch(new Response(JSON.stringify(plan), { status: 200 }));
    renderScreen();
    await screen.findByText(/il manque environ 42 minutes/i);
  });

  it("setting availability submits minutes per weekday and refreshes the plan", async () => {
    stubFetch(new Response(JSON.stringify({ error: "no-capacity" }), { status: 422 }));
    const user = userEvent.setup();
    renderScreen();
    await screen.findByText(/tes disponibilités/i);

    await user.click(screen.getByRole("button", { name: /enregistrer mes disponibilités/i }));

    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    const call = fetchMock.mock.calls.find((args: unknown[]) => args[0] === "/api/availability");
    expect(call).toBeDefined();
    expect(call?.[1]).toMatchObject({ method: "PUT" });
  });

  it("setting a deadline submits the chosen date", async () => {
    stubFetch(new Response(JSON.stringify({ error: "no-usable-day" }), { status: 422 }));
    const user = userEvent.setup();
    renderScreen();
    await screen.findByText(/aucun jour disponible/i);

    await user.type(screen.getByLabelText(/^date$/i), "2026-05-01");
    await user.click(screen.getByRole("button", { name: /définir l'échéance/i }));

    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    const call = fetchMock.mock.calls.find((args: unknown[]) => args[0] === "/api/documents/doc-1/deadline");
    expect(call).toBeDefined();
    expect(call?.[1]).toMatchObject({ method: "POST" });
    expect(JSON.parse((call?.[1] as { body: string }).body)).toEqual({ date: "2026-05-01" });
  });
});
