// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "./App.js";
import { apiFetch } from "./lib/api-client.js";

function stubAuthenticatedFetch() {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation((url: string) => {
      if (typeof url === "string" && url.includes("/api/me")) return Promise.resolve(new Response(JSON.stringify({ id: "u1", username: "alex" }), { status: 200 }));
      if (typeof url === "string" && url.startsWith("/api/calendar")) {
        const params = new URLSearchParams(url.split("?")[1]);
        return Promise.resolve(new Response(JSON.stringify({ start: params.get("start"), end: params.get("end"), days: [] }), { status: 200 }));
      }
      return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
    }),
  );
}

describe("App", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("loading state: shows a loading indicator while the initial session check is in flight", () => {
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(new Promise(() => {})));

    render(<App />);

    expect(screen.getByText(/chargement/i)).toBeInTheDocument();
  });

  it("error state: shows an error message if the session check fails outright", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));

    render(<App />);

    expect(await screen.findByRole("alert")).toHaveTextContent(/session/i);
  });

  it("unauthenticated: shows the login screen (protected content never renders when logged out)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 401 })));

    render(<App />);

    expect(await screen.findByRole("button", { name: /se connecter/i })).toBeInTheDocument();
  });

  it("authenticated: shows the app content, not the login form", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "u1", username: "alex" }), { status: 200 })),
    );

    render(<App />);

    expect(await screen.findByText(/alex/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /se connecter/i })).not.toBeInTheDocument();
  });

  it("authenticated: the nav offers all four real destinations, Aujourd'hui, Mes cours, Progression and Calendrier, from anywhere", async () => {
    stubAuthenticatedFetch();

    render(<App />);

    await screen.findByText(/alex/i);
    expect(screen.getByRole("button", { name: "Aujourd'hui" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Mes cours" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Progression" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Calendrier" })).toBeInTheDocument();
  });

  it("Calendrier is reachable directly from the nav and opens a course from its day panel", async () => {
    stubAuthenticatedFetch();
    const user = userEvent.setup();

    render(<App />);
    await screen.findByText(/alex/i);

    await user.click(screen.getByRole("button", { name: "Calendrier" }));
    await screen.findByTestId("calendar-grid");

    // Empty month (stubAuthenticatedFetch returns no days): the nav is
    // still reachable from here, proving Calendrier has no "Retour" of
    // its own — same rule Aujourd'hui already follows.
    expect(screen.queryByText(/^retour$/i)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Mes cours" }));
    await screen.findByRole("heading", { name: "Mes cours" });
  });

  it("Progression is reachable directly from the nav, and its own 'Retour' returns to Mes cours when there is no originating course", async () => {
    stubAuthenticatedFetch();
    const user = userEvent.setup();

    render(<App />);
    await screen.findByText(/alex/i);

    await user.click(screen.getByRole("button", { name: "Progression" }));
    await screen.findByRole("heading", { name: "Progression" });

    await user.click(screen.getByRole("button", { name: "Retour" }));
    await screen.findByRole("heading", { name: "Mes cours" });
  });

  it("a 401 on any protected call bounces an authenticated session back to the login screen", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "u1", username: "alex" }), { status: 200 })),
    );

    render(<App />);
    await screen.findByText(/alex/i);

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 401 })));
    await act(async () => {
      await apiFetch("/api/some-other-protected-endpoint");
    });

    await waitFor(() => expect(screen.getByRole("button", { name: /se connecter/i })).toBeInTheDocument());
  });
});
