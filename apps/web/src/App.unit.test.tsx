// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
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
      // Aujourd'hui (the app's own default landing view) calls this
      // endpoint on every mount — a valid empty TodayView, not the bare []
      // every other route gets.
      if (typeof url === "string" && url.startsWith("/api/today")) {
        return Promise.resolve(
          new Response(JSON.stringify({ date: "2026-01-01", dueCards: [], notionsBelowTarget: [], todos: [], upcomingDeadlines: [], streak: 0 }), { status: 200 }),
        );
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
    stubAuthenticatedFetch();

    render(<App />);

    expect(await screen.findByText("Bonjour, alex.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /se connecter/i })).not.toBeInTheDocument();
  });

  it("authenticated: the nav offers all seven real destinations, in order — Aujourd'hui, Mes cours, Notions, Lecteur, Progression, Calendrier, Tuteur (docs/UI.md's Navigation note, M9)", async () => {
    stubAuthenticatedFetch();

    render(<App />);

    await screen.findByText("Bonjour, alex.");
    const names = ["Aujourd'hui", "Mes cours", "Notions", "Lecteur", "Progression", "Calendrier", "Tuteur"];
    for (const name of names) {
      expect(screen.getByRole("button", { name })).toBeInTheDocument();
    }
    const nav = screen.getByRole("navigation", { name: "Navigation principale" });
    const buttons = within(nav).getAllByRole("button");
    expect(buttons.map((b) => b.textContent)).toEqual(names);
  });

  it("authenticated: lands on Aujourd'hui by default (the app's own home screen), greeting the real connected user", async () => {
    stubAuthenticatedFetch();

    render(<App />);

    expect(await screen.findByRole("heading", { name: "Bonjour, alex" })).toBeInTheDocument();
  });

  it("Aujourd'hui stays reachable from the nav after navigating away from it", async () => {
    stubAuthenticatedFetch();
    const user = userEvent.setup();

    render(<App />);
    await screen.findByRole("heading", { name: "Bonjour, alex" });

    await user.click(screen.getByRole("button", { name: "Mes cours" }));
    await screen.findByRole("heading", { name: "Mes cours" });

    await user.click(screen.getByRole("button", { name: "Aujourd'hui" }));

    expect(await screen.findByRole("heading", { name: "Bonjour, alex" })).toBeInTheDocument();
  });

  it("Notions and Lecteur each mark their own nav item active, never 'Mes cours' — each is its own destination now (M9), not a Mes cours sub-state", async () => {
    stubAuthenticatedFetch();
    const user = userEvent.setup();

    render(<App />);
    await screen.findByText("Bonjour, alex.");

    await user.click(screen.getByRole("button", { name: "Notions" }));
    await screen.findByRole("heading", { name: "Notions" });
    expect(screen.getByRole("button", { name: "Notions" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("button", { name: "Mes cours" })).not.toHaveAttribute("aria-current");

    await user.click(screen.getByRole("button", { name: "Lecteur" }));
    await screen.findByRole("heading", { name: "Lecteur" });
    expect(screen.getByRole("button", { name: "Lecteur" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("button", { name: "Mes cours" })).not.toHaveAttribute("aria-current");
  });

  it("Tuteur is reachable directly from the nav (a course picker) and from within a course via NotionsScreen's 'Discuter du cours'", async () => {
    const aDocument = { id: "doc-1", title: "Cours test", sourceType: "photo", status: "done", pageCount: 1, colour: "#F87171", createdAt: "2026-01-01T00:00:00Z" };
    const aNotion = { id: "n1", documentId: "doc-1", userId: "u1", title: "Notion 1", body: "Corps.", difficulty: "medium", position: 0, createdAt: "2026-01-01T00:00:00Z" };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        if (typeof url !== "string") return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
        if (url.includes("/api/me")) return Promise.resolve(new Response(JSON.stringify({ id: "u1", username: "alex" }), { status: 200 }));
        if (url.startsWith("/api/today")) {
          return Promise.resolve(
            new Response(JSON.stringify({ date: "2026-01-01", dueCards: [], notionsBelowTarget: [], todos: [], upcomingDeadlines: [], streak: 0 }), { status: 200 }),
          );
        }
        if (/\/api\/documents\/doc-1\/notions-progress/.test(url)) return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
        if (/\/api\/documents\/doc-1\/notions/.test(url)) return Promise.resolve(new Response(JSON.stringify([aNotion]), { status: 200 }));
        if (/\/api\/documents\/doc-1\/progress/.test(url)) return Promise.resolve(new Response(JSON.stringify({ mastered: 0, total: 1 }), { status: 200 }));
        if (/\/api\/documents\/doc-1$/.test(url)) return Promise.resolve(new Response(JSON.stringify({ ...aDocument, lastError: null, markdown: "Contenu du cours." }), { status: 200 }));
        if (/\/api\/documents$/.test(url)) return Promise.resolve(new Response(JSON.stringify([aDocument]), { status: 200 }));
        return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
      }),
    );
    const user = userEvent.setup();

    render(<App />);
    await screen.findByText("Bonjour, alex.");

    // Directly from the nav: a picker, not a specific course's chat yet.
    await user.click(screen.getByRole("button", { name: "Tuteur" }));
    await screen.findByRole("heading", { name: "Tuteur" });
    await screen.findByText("Cours test");
    expect(screen.getByRole("button", { name: /discuter/i })).toBeInTheDocument();

    // From within a course instead: the Notions picker's own entry — Mes
    // cours' own cards dropped "Voir les notions" in its redesign (Notions
    // is independently reachable from the nav now, M9).
    await user.click(screen.getByRole("button", { name: "Notions" }));
    await user.click(screen.getByRole("button", { name: "Voir les notions" }));
    await screen.findByRole("heading", { name: "Notions du cours" });

    await user.click(screen.getByRole("button", { name: "Discuter du cours" }));
    await screen.findByRole("heading", { name: "Tuteur" });
    await screen.findByRole("textbox");

    await user.click(screen.getByRole("button", { name: "Retour" }));
    await screen.findByRole("heading", { name: "Notions du cours" });
  });

  // docs/UI.md's Navigation note (M9): Notions and Lecteur gain the same
  // dual-entry shape Tuteur already has — reachable directly from the nav
  // with no course chosen, landing on the shared picker (CoursePickerScreen),
  // and "Retour" from a course reached that way returns to the picker
  // itself, never to Mes cours (fromPicker, distinct from the unchanged
  // "opened from a course's own card" path already covered elsewhere).
  it("Notions is reachable directly from the nav (a course picker); 'Retour' from there returns to the picker, not Mes cours", async () => {
    const aDocument = { id: "doc-1", title: "Cours test", sourceType: "photo", status: "done", pageCount: 1, colour: "#F87171", createdAt: "2026-01-01T00:00:00Z" };
    const aNotion = { id: "n1", documentId: "doc-1", userId: "u1", title: "Notion 1", body: "Corps.", difficulty: "medium", position: 0, createdAt: "2026-01-01T00:00:00Z" };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        if (typeof url !== "string") return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
        if (url.includes("/api/me")) return Promise.resolve(new Response(JSON.stringify({ id: "u1", username: "alex" }), { status: 200 }));
        if (url.startsWith("/api/today")) {
          return Promise.resolve(
            new Response(JSON.stringify({ date: "2026-01-01", dueCards: [], notionsBelowTarget: [], todos: [], upcomingDeadlines: [], streak: 0 }), { status: 200 }),
          );
        }
        if (/\/api\/documents\/doc-1\/notions-progress/.test(url)) return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
        if (/\/api\/documents\/doc-1\/notions/.test(url)) return Promise.resolve(new Response(JSON.stringify([aNotion]), { status: 200 }));
        if (/\/api\/documents\/doc-1\/progress/.test(url)) return Promise.resolve(new Response(JSON.stringify({ mastered: 0, total: 1 }), { status: 200 }));
        if (/\/api\/documents$/.test(url)) return Promise.resolve(new Response(JSON.stringify([aDocument]), { status: 200 }));
        return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
      }),
    );
    const user = userEvent.setup();

    render(<App />);
    await screen.findByText("Bonjour, alex.");

    // Directly from the nav: a picker, not a specific course's notions yet.
    await user.click(screen.getByRole("button", { name: "Notions" }));
    await screen.findByRole("heading", { name: "Notions" });
    await screen.findByText("Cours test");

    await user.click(screen.getByRole("button", { name: "Voir les notions" }));
    await screen.findByRole("heading", { name: "Notions du cours" });

    // fromPicker: "Retour", not "Retour à mes cours", and it goes back to
    // the picker (heading "Notions"), not to Mes cours.
    await user.click(screen.getByRole("button", { name: "Retour" }));
    await screen.findByRole("heading", { name: "Notions" });
    expect(screen.queryByRole("heading", { name: "Mes cours" })).not.toBeInTheDocument();
  });

  it("Lecteur is reachable directly from the nav (a course picker); 'Retour' from there returns to the picker, not Mes cours", async () => {
    const aDocument = { id: "doc-1", title: "Cours test", sourceType: "photo", status: "done", pageCount: 1, colour: "#F87171", createdAt: "2026-01-01T00:00:00Z" };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        if (typeof url !== "string") return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
        if (url.includes("/api/me")) return Promise.resolve(new Response(JSON.stringify({ id: "u1", username: "alex" }), { status: 200 }));
        if (url.startsWith("/api/today")) {
          return Promise.resolve(
            new Response(JSON.stringify({ date: "2026-01-01", dueCards: [], notionsBelowTarget: [], todos: [], upcomingDeadlines: [], streak: 0 }), { status: 200 }),
          );
        }
        if (/\/api\/documents\/doc-1$/.test(url)) return Promise.resolve(new Response(JSON.stringify({ ...aDocument, lastError: null, markdown: "Contenu du cours." }), { status: 200 }));
        if (/\/api\/documents$/.test(url)) return Promise.resolve(new Response(JSON.stringify([aDocument]), { status: 200 }));
        return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
      }),
    );
    const user = userEvent.setup();

    render(<App />);
    await screen.findByText("Bonjour, alex.");

    // Directly from the nav: a picker, not a specific course's content yet.
    await user.click(screen.getByRole("button", { name: "Lecteur" }));
    await screen.findByRole("heading", { name: "Lecteur" });
    await screen.findByText("Cours test");

    await user.click(screen.getByRole("button", { name: "Lire le cours" }));
    await screen.findByRole("heading", { name: "Lecture" });
    await screen.findByText("Contenu du cours.");

    await user.click(screen.getByRole("button", { name: "Retour" }));
    await screen.findByRole("heading", { name: "Lecteur" });
    expect(screen.queryByRole("heading", { name: "Mes cours" })).not.toBeInTheDocument();
  });

  it("authenticated: the content area reserves space for the now-fixed desktop sidebar, so a long page's content never renders underneath it", async () => {
    stubAuthenticatedFetch();

    render(<App />);

    await screen.findByText("Bonjour, alex.");
    expect(screen.getByTestId("app-content").className).toMatch(/md:ml-60/);
  });

  it("Calendrier is reachable directly from the nav and opens a course from its day panel", async () => {
    stubAuthenticatedFetch();
    const user = userEvent.setup();

    render(<App />);
    await screen.findByText("Bonjour, alex.");

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
    await screen.findByText("Bonjour, alex.");

    await user.click(screen.getByRole("button", { name: "Progression" }));
    await screen.findByRole("heading", { name: "Progression" });

    await user.click(screen.getByRole("button", { name: "Retour" }));
    await screen.findByRole("heading", { name: "Mes cours" });
  });

  it("Lecteur opened from Notions du cours returns there on 'Retour', not to Mes cours (fromNotions, same mechanic as ProgressScreen's own fromDocumentId)", async () => {
    const aDocument = { id: "doc-1", title: "Cours test", sourceType: "photo", status: "done", pageCount: 1, colour: "#F87171", createdAt: "2026-01-01T00:00:00Z" };
    const aNotion = { id: "n1", documentId: "doc-1", userId: "u1", title: "Notion 1", body: "Corps.", difficulty: "medium", position: 0, createdAt: "2026-01-01T00:00:00Z" };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        if (typeof url !== "string") return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
        if (url.includes("/api/me")) return Promise.resolve(new Response(JSON.stringify({ id: "u1", username: "alex" }), { status: 200 }));
        if (url.startsWith("/api/today")) {
          return Promise.resolve(
            new Response(JSON.stringify({ date: "2026-01-01", dueCards: [], notionsBelowTarget: [], todos: [], upcomingDeadlines: [], streak: 0 }), { status: 200 }),
          );
        }
        if (/\/api\/documents\/doc-1\/notions-progress/.test(url)) return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
        if (/\/api\/documents\/doc-1\/notions/.test(url)) return Promise.resolve(new Response(JSON.stringify([aNotion]), { status: 200 }));
        if (/\/api\/documents\/doc-1\/progress/.test(url)) return Promise.resolve(new Response(JSON.stringify({ mastered: 0, total: 1 }), { status: 200 }));
        if (/\/api\/documents\/doc-1$/.test(url)) {
          return Promise.resolve(
            new Response(JSON.stringify({ ...aDocument, lastError: null, markdown: "Contenu du cours." }), { status: 200 }),
          );
        }
        if (/\/api\/documents$/.test(url)) return Promise.resolve(new Response(JSON.stringify([aDocument]), { status: 200 }));
        return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
      }),
    );
    const user = userEvent.setup();

    render(<App />);
    await screen.findByRole("heading", { name: "Bonjour, alex" });
    // Via the Notions picker, not Mes cours — Mes cours' own cards dropped
    // "Voir les notions" in its redesign (Notions is independently
    // reachable from the nav now, M9).
    await user.click(screen.getByRole("button", { name: "Notions" }));
    await screen.findByText("Cours test");

    await user.click(screen.getByRole("button", { name: "Voir les notions" }));
    await screen.findByRole("heading", { name: "Notions du cours" });

    await user.click(screen.getByRole("button", { name: "Lire le cours" }));
    await screen.findByRole("heading", { name: "Lecture" });

    await user.click(screen.getByRole("button", { name: "Retour" }));
    await screen.findByRole("heading", { name: "Notions du cours" });
  });

  it("a 401 on any protected call bounces an authenticated session back to the login screen", async () => {
    stubAuthenticatedFetch();

    render(<App />);
    await screen.findByText("Bonjour, alex.");

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 401 })));
    await act(async () => {
      await apiFetch("/api/some-other-protected-endpoint");
    });

    await waitFor(() => expect(screen.getByRole("button", { name: /se connecter/i })).toBeInTheDocument());
  });
});
