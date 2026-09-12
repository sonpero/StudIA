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
      // A real 404, not the bare []/200 every other route gets: PomodoroCard
      // and the persistent header widget (useActivePomodoro) both treat any
      // truthy body as an active session, and [] is truthy — this endpoint
      // needs its own real "no session" shape or every screen would render
      // a bogus countdown.
      if (typeof url === "string" && url === "/api/pomodoro/active") return Promise.resolve(new Response(null, { status: 404 }));
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

  it("authenticated: the nav offers all seven real destinations, in order — Aujourd'hui, Mes cours, Notions, Lecteur, Progrès, Agenda, Tuteur (docs/UI.md's Navigation note, M9)", async () => {
    stubAuthenticatedFetch();

    render(<App />);

    await screen.findByText("Bonjour, alex.");
    const names = ["Aujourd'hui", "Mes cours", "Notions", "Lecteur", "Progrès", "Agenda", "Tuteur"];
    for (const name of names) {
      expect(screen.getByRole("button", { name })).toBeInTheDocument();
    }
    const nav = screen.getByRole("navigation", { name: "Navigation principale" });
    const buttons = within(nav).getAllByRole("button");
    // Not b.textContent any more (M10 Phase 1, shell pass): each button
    // now renders both a short mobile-visible label and the full
    // desktop-visible one, one hidden by a CSS breakpoint class the other
    // isn't — both nodes exist in the DOM regardless, since the swap is
    // CSS-only and jsdom applies no real layout/media query to hide
    // either one, so textContent concatenates both ("AccueilAujourd'hui").
    // toHaveAccessibleName checks the same "each destination, in order,
    // by its real name" this test always meant, against the computed
    // accessible name instead — true regardless of which mechanism
    // supplies that name (aria-label today, or visually-hidden text
    // tomorrow), which a mechanism-specific check (e.g. reading the
    // aria-label attribute directly) would not be.
    buttons.forEach((button, index) => {
      expect(button).toHaveAccessibleName(names[index]!);
    });
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

  // Tuteur's own later redesign unified it with the same pill selector
  // Notions/Lecteur already use (docs/UI.md's Tuteur note): the nav's own
  // direct entry shows a pill selector plus the first course's own chat
  // immediately, no separate picker page.
  it("Tuteur is reachable directly from the nav via its own pill selector, and from within a course via NotionsScreen's 'Discuter du cours'", async () => {
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

    // Directly from the nav: its own pill selector, the first (only)
    // course pre-selected and its chat shown immediately, no back link.
    await user.click(screen.getByRole("button", { name: "Tuteur" }));
    await screen.findByRole("heading", { name: "Tuteur" });
    expect(screen.getByRole("button", { name: "Cours test" })).toHaveAttribute("aria-current", "page");
    expect(screen.queryByRole("button", { name: /retour/i })).not.toBeInTheDocument();
    await screen.findByRole("textbox");

    // From within a course instead: Notions' own redesign (M9) shows the
    // first (only) course's notions directly, no separate "Voir les
    // notions" step.
    await user.click(screen.getByRole("button", { name: "Notions" }));
    await screen.findByRole("heading", { name: "Cours test" });

    await user.click(screen.getByRole("button", { name: "Discuter du cours" }));
    await screen.findByRole("heading", { name: "Tuteur" });
    await screen.findByRole("textbox");

    await user.click(screen.getByRole("button", { name: "Retour" }));
    await screen.findByRole("heading", { name: "Cours test" });
  });

  // M9's own redesign of Notions: reachable directly from the nav with no
  // course chosen, showing a pill selector plus the first course's own
  // notions immediately — no separate picker page to land on first (Lecteur
  // and Tuteur, below, later dropped their own shared CoursePickerScreen
  // the same way, in their own redesigns). No "Retour" at all in that state
  // (matching Aujourd'hui/Mes cours' own top-level pages): there is no
  // picker page left to have come from.
  it("Notions is reachable directly from the nav, showing a course pill selector and the first course's own notions immediately, no back link", async () => {
    const docOne = { id: "doc-1", title: "Cours test", sourceType: "photo", status: "done", pageCount: 1, colour: "#F87171", createdAt: "2026-01-01T00:00:00Z" };
    const docTwo = { id: "doc-2", title: "Autre cours", sourceType: "photo", status: "done", pageCount: 1, colour: "#38BDF8", createdAt: "2026-01-01T00:00:00Z" };
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
        if (/\/api\/documents$/.test(url)) return Promise.resolve(new Response(JSON.stringify([docOne, docTwo]), { status: 200 }));
        return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
      }),
    );
    const user = userEvent.setup();

    render(<App />);
    await screen.findByText("Bonjour, alex.");

    await user.click(screen.getByRole("button", { name: "Notions" }));

    expect(await screen.findByRole("heading", { name: "Notions" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cours test" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("button", { name: "Autre cours" })).toBeInTheDocument();
    await screen.findByRole("heading", { name: "Cours test" });
    expect(screen.queryByRole("button", { name: /retour/i })).not.toBeInTheDocument();
  });

  // Lecteur's own later redesign unified it with the same pill selector
  // Notions already uses (docs/UI.md's Lecteur note): the nav's own direct
  // entry shows a pill selector plus the first course's own content
  // immediately, no separate picker page and no back link — the same shape
  // the Notions test above already covers.
  it("Lecteur is reachable directly from the nav, showing a course pill selector and the first course's own content immediately, no back link", async () => {
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

    await user.click(screen.getByRole("button", { name: "Lecteur" }));

    expect(await screen.findByRole("heading", { name: "Lecteur" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cours test" })).toHaveAttribute("aria-current", "page");
    await screen.findByText("Contenu du cours.");
    expect(screen.queryByRole("button", { name: /retour/i })).not.toBeInTheDocument();
  });

  it("authenticated: the content area reserves space for the now-fixed desktop sidebar, so a long page's content never renders underneath it", async () => {
    stubAuthenticatedFetch();

    render(<App />);

    await screen.findByText("Bonjour, alex.");
    expect(screen.getByTestId("app-content").className).toMatch(/md:ml-60/);
  });

  // M10 Phase 1, shell pass. Three fixes to the header bar, all class-name
  // assertions (docs/UI.md's own admitted exception): jsdom applies no
  // real CSS, so there is no rendered layout or media query to check
  // instead.
  describe("header bar (M10 Phase 1)", () => {
    it("reserves space for the mobile bottom bar via the shared token, not a guessed pb-16 — one source, not two numbers to keep in sync by hand", async () => {
      stubAuthenticatedFetch();
      render(<App />);
      await screen.findByText("Bonjour, alex.");

      const className = screen.getByTestId("app-content").className;
      expect(className).toMatch(/pb-\[var\(--nav-bar-height-mobile\)\]/);
      expect(className).not.toMatch(/(?:^|\s)pb-16(?:\s|$)/);
      expect(className).toMatch(/md:pb-0/);
    });

    it("the header bar's own horizontal padding is 16px below 768px, 32px at or above it, per docs/UI.md's Responsive conventions note", async () => {
      stubAuthenticatedFetch();
      render(<App />);
      await screen.findByText("Bonjour, alex.");

      const header = screen.getByTestId("app-header");
      expect(header.className).toMatch(/(?:^|\s)px-4(?:\s|$)/);
      expect(header.className).toMatch(/md:px-8(?:\s|$)/);
    });

    it("'Se déconnecter' is migrated to the shared link variant (the 44px hit-zone mechanism), not a bare unstyled <button>, its accessible name unchanged", async () => {
      stubAuthenticatedFetch();
      const user = userEvent.setup();
      render(<App />);
      await screen.findByText("Bonjour, alex.");

      const button = screen.getByRole("button", { name: "Se déconnecter" });
      expect(button.className).toMatch(/before:absolute/);

      await user.click(button);
      expect(await screen.findByRole("button", { name: /se connecter/i })).toBeInTheDocument();
    });

    it("shows the app's own identity (logo + name) in the header, visible only below 768px — desktop already carries it in the sidebar", async () => {
      stubAuthenticatedFetch();
      render(<App />);
      await screen.findByText("Bonjour, alex.");

      const identity = screen.getByTestId("mobile-app-identity");
      expect(identity).toHaveTextContent("StudIA");
      expect(identity.className).toMatch(/md:hidden(?:\s|$)/);
      // Not a second, separately-authored identity block: the sidebar's own
      // (AppNav.tsx) is the only other "StudIA" text in the tree, and it is
      // desktop-only (hidden md:flex) — never both visible in the same
      // rendered state, so getByText would still resolve to one match at
      // any single breakpoint even though jsdom itself doesn't enforce it.
      expect(screen.getAllByText("StudIA")).toHaveLength(2);
    });
  });

  it("Agenda is reachable directly from the nav and opens a course from its day panel", async () => {
    stubAuthenticatedFetch();
    const user = userEvent.setup();

    render(<App />);
    await screen.findByText("Bonjour, alex.");

    await user.click(screen.getByRole("button", { name: "Agenda" }));
    await screen.findByTestId("calendar-grid");

    // Empty month (stubAuthenticatedFetch returns no days): the nav is
    // still reachable from here, proving Agenda has no "Retour" of
    // its own — same rule Aujourd'hui already follows.
    expect(screen.queryByText(/^retour$/i)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Mes cours" }));
    await screen.findByRole("heading", { name: "Mes cours" });
  });

  it("Progrès is reachable directly from the nav, and its own 'Retour' returns to Mes cours when there is no originating course", async () => {
    stubAuthenticatedFetch();
    const user = userEvent.setup();

    render(<App />);
    await screen.findByText("Bonjour, alex.");

    await user.click(screen.getByRole("button", { name: "Progrès" }));
    await screen.findByRole("heading", { name: "Progrès" });

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
    // Notions shows its own pill selector plus the first (only) course's
    // notions directly now (M9's own redesign) — no separate "Voir les
    // notions" step, unlike Mes cours' cards, which dropped that button
    // entirely in its own redesign.
    await user.click(screen.getByRole("button", { name: "Notions" }));
    await screen.findByRole("heading", { name: "Cours test" });

    await user.click(screen.getByRole("button", { name: "Lire le cours" }));
    await screen.findByRole("heading", { name: "Lecteur" });
    await screen.findByText("Contenu du cours.");

    await user.click(screen.getByRole("button", { name: "Retour" }));
    await screen.findByRole("heading", { name: "Cours test" });
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

  // Persistent pomodoro, lot 1 of 3 (see CLAUDE.md's session history): a
  // running session stays visible everywhere via a small header widget,
  // hidden only on Aujourd'hui itself, where PomodoroCard already shows the
  // same countdown — showing both at once would give two elements
  // reachable by the same accessible name, exactly the ambiguity
  // AppNav.tsx's own header comment already warns against.
  describe("persistent pomodoro header widget and tab title (lot 1)", () => {
    function stubWithPomodoroStart() {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockImplementation((url: string, init?: RequestInit) => {
          if (typeof url === "string" && url.includes("/api/me")) return Promise.resolve(new Response(JSON.stringify({ id: "u1", username: "alex" }), { status: 200 }));
          if (typeof url === "string" && url.startsWith("/api/today")) {
            return Promise.resolve(
              new Response(JSON.stringify({ date: "2026-01-01", dueCards: [], notionsBelowTarget: [], todos: [], upcomingDeadlines: [], streak: 0 }), { status: 200 }),
            );
          }
          if (typeof url === "string" && url === "/api/pomodoro/active") return Promise.resolve(new Response(null, { status: 404 }));
          if (typeof url === "string" && url === "/api/pomodoro" && init?.method === "POST") {
            return Promise.resolve(
              new Response(JSON.stringify({ id: "s1", userId: "u1", todoId: null, startedAt: new Date().toISOString(), endedAt: null, durationSeconds: 1500 }), { status: 201 }),
            );
          }
          if (typeof url === "string" && url === "/api/pomodoro/s1/end" && init?.method === "POST") return Promise.resolve(new Response(null, { status: 204 }));
          return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
        }),
      );
    }

    afterEach(() => {
      document.title = "";
    });

    it("no active session: the widget renders nothing on any screen", async () => {
      stubAuthenticatedFetch();
      const user = userEvent.setup();
      render(<App />);
      await screen.findByText("Bonjour, alex.");

      await user.click(screen.getByRole("button", { name: "Mes cours" }));
      await screen.findByRole("heading", { name: "Mes cours" });

      expect(screen.queryByTestId("pomodoro-header-widget")).not.toBeInTheDocument();
    });

    it("an active session shows the live countdown in the header on another screen, but is hidden on Aujourd'hui itself where PomodoroCard already shows it", async () => {
      stubWithPomodoroStart();
      const user = userEvent.setup();
      render(<App />);
      await screen.findByText("Bonjour, alex.");
      await user.click(screen.getByRole("button", { name: "Démarrer" }));
      await screen.findByRole("button", { name: "Terminer" });

      // Still on Aujourd'hui: PomodoroCard shows the countdown, the header
      // widget must not — otherwise two elements would carry the same
      // countdown text at once.
      expect(screen.queryByTestId("pomodoro-header-widget")).not.toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "Mes cours" }));
      await screen.findByRole("heading", { name: "Mes cours" });

      expect(await screen.findByTestId("pomodoro-header-widget")).toHaveTextContent(/^\d{2}:\d{2}$/);

      // Back to Aujourd'hui: the widget hides again, PomodoroCard resumes
      // showing the still-live session (not reset — this is ÉTAPE 0's own
      // fix, exercised end to end here through real navigation).
      await user.click(screen.getByRole("button", { name: "Aujourd'hui" }));
      await screen.findByRole("button", { name: "Terminer" });
      expect(screen.queryByTestId("pomodoro-header-widget")).not.toBeInTheDocument();
    });

    it("the document title shows the live countdown while a session is active, and restores the original title once it ends", async () => {
      document.title = "StudIA";
      stubWithPomodoroStart();
      const user = userEvent.setup();
      render(<App />);
      await screen.findByText("Bonjour, alex.");
      expect(document.title).toBe("StudIA");

      await user.click(screen.getByRole("button", { name: "Démarrer" }));
      await screen.findByRole("button", { name: "Terminer" });

      await waitFor(() => expect(document.title).toMatch(/^\d{2}:\d{2} · StudIA$/));

      await user.click(screen.getByRole("button", { name: "Terminer" }));
      await screen.findByRole("button", { name: "Démarrer" });

      await waitFor(() => expect(document.title).toBe("StudIA"));
    });

    it("restores the original title on unmount, even mid-session", async () => {
      document.title = "StudIA";
      stubWithPomodoroStart();
      const user = userEvent.setup();
      const { unmount } = render(<App />);
      await screen.findByText("Bonjour, alex.");

      await user.click(screen.getByRole("button", { name: "Démarrer" }));
      await screen.findByRole("button", { name: "Terminer" });
      await waitFor(() => expect(document.title).toMatch(/^\d{2}:\d{2} · StudIA$/));

      unmount();

      expect(document.title).toBe("StudIA");
    });
  });
});
