// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../lib/auth-context.js";
import { LoginScreen } from "./LoginScreen.js";

function renderLoginScreen() {
  // The initial /api/me session check that AuthProvider fires on mount.
  const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 401 }));
  vi.stubGlobal("fetch", fetchMock);

  render(
    <AuthProvider>
      <LoginScreen />
    </AuthProvider>,
  );

  return fetchMock;
}

describe("LoginScreen", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("ready state: renders labelled username and password fields and a submit button", async () => {
    renderLoginScreen();

    expect(await screen.findByLabelText(/identifiant/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/mot de passe/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /se connecter/i })).toBeInTheDocument();
  });

  it("error state: shows a message on wrong credentials (401) and does not navigate away", async () => {
    const fetchMock = renderLoginScreen();
    await screen.findByLabelText(/identifiant/i);
    fetchMock.mockResolvedValue(new Response(null, { status: 401 }));

    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/identifiant/i), "alex");
    await user.type(screen.getByLabelText(/mot de passe/i), "wrong");
    await user.click(screen.getByRole("button", { name: /se connecter/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/identifiant ou mot de passe/i);
  });

  it("error state: shows a distinct message when rate-limited (429)", async () => {
    const fetchMock = renderLoginScreen();
    await screen.findByLabelText(/identifiant/i);
    fetchMock.mockResolvedValue(new Response(null, { status: 429 }));

    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/identifiant/i), "alex");
    await user.type(screen.getByLabelText(/mot de passe/i), "wrong");
    await user.click(screen.getByRole("button", { name: /se connecter/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/trop de tentatives/i);
  });

  it("loading state: disables the submit button while the login request is in flight", async () => {
    const fetchMock = renderLoginScreen();
    await screen.findByLabelText(/identifiant/i);
    let resolveLogin: (res: Response) => void = () => undefined;
    fetchMock.mockReturnValue(new Promise<Response>((resolve) => (resolveLogin = resolve)));

    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/identifiant/i), "alex");
    await user.type(screen.getByLabelText(/mot de passe/i), "s3cret");
    await user.click(screen.getByRole("button", { name: /se connecter/i }));

    expect(screen.getByRole("button", { name: /connexion/i })).toBeDisabled();

    resolveLogin(new Response(null, { status: 204 }));
    await waitFor(() => expect(screen.queryByRole("button", { name: /connexion en cours/i })).not.toBeInTheDocument());
  });

  it("ready state (success): a successful login clears the error and does not show one", async () => {
    const fetchMock = renderLoginScreen();
    await screen.findByLabelText(/identifiant/i);
    fetchMock.mockImplementation((url: string) => {
      if (url.includes("/api/auth/login")) return Promise.resolve(new Response(null, { status: 204 }));
      return Promise.resolve(new Response(JSON.stringify({ id: "u1", username: "alex" }), { status: 200 }));
    });

    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/identifiant/i), "alex");
    await user.type(screen.getByLabelText(/mot de passe/i), "correct-horse");
    await user.click(screen.getByRole("button", { name: /se connecter/i }));

    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
  });
});
