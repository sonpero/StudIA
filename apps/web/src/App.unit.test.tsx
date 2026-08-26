// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "./App.js";
import { apiFetch } from "./lib/api-client.js";

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
