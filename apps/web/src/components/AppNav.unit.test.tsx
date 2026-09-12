// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BookOpen, Home, TrendingUp } from "lucide-react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppNav, type AppNavItem } from "./AppNav.js";

function items(overrides: Partial<Record<string, Partial<AppNavItem>>> = {}): AppNavItem[] {
  const base: AppNavItem[] = [
    { key: "today", label: "Aujourd'hui", shortLabel: "Accueil", icon: Home, active: false, onClick: () => undefined },
    { key: "documents", label: "Mes cours", shortLabel: "Cours", icon: BookOpen, active: false, onClick: () => undefined },
    { key: "progress", label: "Progrès", icon: TrendingUp, active: false, onClick: () => undefined },
  ];
  return base.map((item) => ({ ...item, ...overrides[item.key] }));
}

// streak/dueCount/username became real (App.tsx's own GET /api/today and
// useAuth) once the redesigned Aujourd'hui screen's own sidebar
// (apps/web/src/screens/TodayScreen.tsx) became the app's real one — every
// existing test below that doesn't care about their exact values uses this
// same neutral default.
const DEFAULT_SIDEBAR_PROPS = { streak: 0, dueCount: 0, username: "alex" };

describe("AppNav", () => {
  afterEach(() => cleanup());

  it("renders one button per item, as a single nav landmark (not one tree per breakpoint)", () => {
    render(<AppNav items={items()} {...DEFAULT_SIDEBAR_PROPS} />);

    expect(screen.getAllByRole("navigation")).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Aujourd'hui" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Mes cours" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Progrès" })).toBeInTheDocument();
  });

  it("marks the active item with aria-current, and only that one", () => {
    render(<AppNav items={items({ documents: { active: true } })} {...DEFAULT_SIDEBAR_PROPS} />);

    expect(screen.getByRole("button", { name: "Mes cours" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("button", { name: "Aujourd'hui" })).not.toHaveAttribute("aria-current");
    expect(screen.getByRole("button", { name: "Progrès" })).not.toHaveAttribute("aria-current");
  });

  it("clicking an item calls its own onClick, and only its own", async () => {
    const onToday = vi.fn();
    const onDocuments = vi.fn();
    const user = userEvent.setup();
    render(<AppNav items={items({ today: { onClick: onToday }, documents: { onClick: onDocuments } })} {...DEFAULT_SIDEBAR_PROPS} />);

    await user.click(screen.getByRole("button", { name: "Mes cours" }));

    expect(onDocuments).toHaveBeenCalledTimes(1);
    expect(onToday).not.toHaveBeenCalled();
  });

  it("each destination pairs a decorative icon with its own label — the accessible name stays exactly the label, unaffected by the icon (docs/UI.md's Icons note)", () => {
    render(<AppNav items={items()} {...DEFAULT_SIDEBAR_PROPS} />);

    for (const label of ["Aujourd'hui", "Mes cours", "Progrès"]) {
      const button = screen.getByRole("button", { name: label });
      const icon = button.querySelector("svg");
      expect(icon).not.toBeNull();
      expect(icon).toHaveAttribute("aria-hidden", "true");
      expect(icon).toHaveAttribute("focusable", "false");
    }
  });

  it("is fixed to the viewport on desktop too, not just mobile — a long page must not carry it away while scrolling (the bug this fixed: md:static previously put it back in normal flow)", () => {
    render(<AppNav items={items()} {...DEFAULT_SIDEBAR_PROPS} />);

    const nav = screen.getByRole("navigation");
    expect(nav.className).not.toMatch(/md:static/);
    expect(nav.className).toMatch(/md:fixed/);
    expect(nav.className).toMatch(/md:inset-y-0/);
    expect(nav.className).toMatch(/md:left-0/);
  });

  it("stays clickable while dimmed: a focused session must never trap the student behind an unusable nav", async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(<AppNav items={items({ today: { onClick } })} {...DEFAULT_SIDEBAR_PROPS} dimmed />);

    await user.click(screen.getByRole("button", { name: "Aujourd'hui" }));

    expect(onClick).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Aujourd'hui" })).not.toBeDisabled();
  });

  it("shows the app name and tagline", () => {
    render(<AppNav items={items()} {...DEFAULT_SIDEBAR_PROPS} />);

    expect(screen.getByText("StudIA")).toBeInTheDocument();
    expect(screen.getByText("Étudie plus intelligemment")).toBeInTheDocument();
  });

  it("shows the real streak, singular/plural worded correctly, with an encouragement once it's at least 1", () => {
    render(<AppNav items={items()} {...DEFAULT_SIDEBAR_PROPS} streak={9} />);

    expect(screen.getByText("Série de 9 jours")).toBeInTheDocument();
    expect(screen.getByText("Continue comme ça !")).toBeInTheDocument();
  });

  it("a streak of 0 reads as an invitation, not '0 jours' left bare", () => {
    render(<AppNav items={items()} {...DEFAULT_SIDEBAR_PROPS} streak={0} />);

    expect(screen.getByText("Série de 0 jour")).toBeInTheDocument();
    expect(screen.getByText(/commencer une série/i)).toBeInTheDocument();
  });

  it("shows the real connected user's name and their own due count", () => {
    render(<AppNav items={items()} {...DEFAULT_SIDEBAR_PROPS} username="alex" dueCount={24} />);

    expect(screen.getByText("alex")).toBeInTheDocument();
    expect(screen.getByText("24 fiches à réviser")).toBeInTheDocument();
  });

  it("the user chip's initials come from the real username — two words each contribute one letter, a single word its own first two", () => {
    render(<AppNav items={items()} {...DEFAULT_SIDEBAR_PROPS} username="Léa Martin" />);
    expect(screen.getByText("LM")).toBeInTheDocument();
    cleanup();

    render(<AppNav items={items()} {...DEFAULT_SIDEBAR_PROPS} username="alex" />);
    expect(screen.getByText("AL")).toBeInTheDocument();
  });

  // M10 Phase 1, shell pass: below the medium breakpoint, each destination
  // stacks its icon above its label instead of side by side — px-3's own
  // 24px was already a sixth of a 375px viewport's budget for seven
  // destinations before even reaching the label. docs/UI.md's own
  // Responsive conventions note admits class-name assertion as the
  // exception here: jsdom renders no real layout to check the stacked
  // result against instead.
  it("stacks icon above label below 768px, side by side from it — the same button, not a second tree", () => {
    render(<AppNav items={items()} {...DEFAULT_SIDEBAR_PROPS} />);

    const button = screen.getByRole("button", { name: "Aujourd'hui" });
    expect(button.className).toMatch(/(?:^|\s)flex-col(?:\s|$)/);
    expect(button.className).toMatch(/md:flex-row(?:\s|$)/);
  });

  it("keeps the 44px minimum touch target once stacked — the exception docs/UI.md's Responsive conventions note documents, not lost by the new layout", () => {
    render(<AppNav items={items()} {...DEFAULT_SIDEBAR_PROPS} />);

    expect(screen.getByRole("button", { name: "Aujourd'hui" }).className).toMatch(/(?:^|\s)min-h-11(?:\s|$)/);
  });

  it("lets a destination's own button shrink below its label's natural width (min-w-0) so the label wraps instead of forcing the whole bar wider than the viewport", () => {
    render(<AppNav items={items()} {...DEFAULT_SIDEBAR_PROPS} />);

    expect(screen.getByRole("button", { name: "Aujourd'hui" }).className).toMatch(/(?:^|\s)min-w-0(?:\s|$)/);
  });

  it("every destination keeps its exact accessible name once stacked, unaffected by the icon-above-label layout (docs/UI.md's Icons note)", () => {
    render(<AppNav items={items()} {...DEFAULT_SIDEBAR_PROPS} />);

    for (const label of ["Aujourd'hui", "Mes cours", "Progrès"]) {
      expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
    }
  });

  // Measured, not estimated (docs/MILESTONES.md's M10 Phase 1 note): four
  // of the seven full labels didn't fit on one line inside a 53px-wide
  // stacked button at 375px, and forcing a mid-word break ("Aujourd"/
  // "'hui") was confirmed illegible rather than assumed acceptable. The
  // user's own call: a ≤7-character short form is the only mobile-visible
  // text, hidden from assistive tech (aria-hidden), while aria-label
  // carries the real, full name — so the accessible name never changes,
  // only what a sighted mobile user reads.
  it("shows the short form as the visible mobile label, hidden from assistive tech — the accessible name is still the full label, via aria-label", () => {
    render(<AppNav items={items()} {...DEFAULT_SIDEBAR_PROPS} />);

    const button = screen.getByRole("button", { name: "Aujourd'hui" });
    expect(button).toHaveAttribute("aria-label", "Aujourd'hui");

    const mobileSpan = screen.getByText("Accueil");
    expect(mobileSpan).toHaveAttribute("aria-hidden", "true");
    expect(mobileSpan.className).toMatch(/md:hidden(?:\s|$)/);
  });

  it("shows the full label for desktop, hidden on mobile — the same button, not a second one", () => {
    render(<AppNav items={items()} {...DEFAULT_SIDEBAR_PROPS} />);

    const button = screen.getByRole("button", { name: "Aujourd'hui" });
    const desktopSpan = within(button).getByText("Aujourd'hui");
    expect(desktopSpan).toHaveAttribute("aria-hidden", "true");
    expect(desktopSpan.className).toMatch(/(?:^|\s)hidden(?:\s|$)/);
    expect(desktopSpan.className).toMatch(/md:inline(?:\s|$)/);
  });

  // Copy rename follow-up: "Progrès" and "Agenda" are already short enough
  // (7 characters or fewer) to be their own mobile form, the same as
  // Notions/Lecteur/Tuteur before them — an item with no shortLabel at all
  // (AppNavItem's own field is optional, this fixture's own "progress" item
  // carries none) must still show something on mobile, not a blank button.
  it("an item with no shortLabel falls back to the full label as its mobile-visible text", () => {
    render(<AppNav items={items()} {...DEFAULT_SIDEBAR_PROPS} />);

    const button = screen.getByRole("button", { name: "Progrès" });
    expect(button).toHaveAttribute("aria-label", "Progrès");

    const mobileSpan = within(button).getAllByText("Progrès").find((el) => el.className.includes("md:hidden"));
    expect(mobileSpan).not.toBeUndefined();
    expect(mobileSpan).toHaveAttribute("aria-hidden", "true");
  });
});
