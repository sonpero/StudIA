// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Today } from "./Today.js";

// Static prototype (mockup approved) reachable from App.tsx's own nav as
// a temporary staging entry — every value here is still hardcoded mock
// data, so this is a rendering smoke test, not a data-flow test. No
// loading/error states either: nothing is fetched yet. onExit (the
// sidebar's own "Aujourd'hui" row) is the one piece of real navigation
// wired in so far.
describe("Today (front-end prototype)", () => {
  afterEach(() => cleanup());

  it("renders the greeting and the day's summary", () => {
    render(<Today />);
    expect(screen.getByRole("heading", { name: "Bonjour, Léa" })).toBeInTheDocument();
    // "24 fiches" also names the sidebar user chip's own fact
    // ("24 fiches à réviser") — scoped to the summary paragraph so this
    // doesn't accidentally match that unrelated element too.
    expect(screen.getByText(/à réviser dans 4 cours/)).toBeInTheDocument();
  });

  it("renders one card per course, each with its subject and title", () => {
    render(<Today />);
    expect(screen.getByText("Biologie cellulaire et génétique")).toBeInTheDocument();
    expect(screen.getByText("La Révolution française")).toBeInTheDocument();
    expect(screen.getByText("Fonctions quadratiques")).toBeInTheDocument();
    expect(screen.getByText("Le Père Goriot")).toBeInTheDocument();
  });

  it("shows the due count and a 'Réviser' button for a course with cards due", () => {
    render(<Today />);
    const card = screen.getByText("Biologie cellulaire et génétique").closest('[data-testid="course-today-card"]') as HTMLElement;
    expect(within(card).getByText("12")).toBeInTheDocument();
    expect(within(card).getByText(/fiches à revoir/)).toBeInTheDocument();
    expect(within(card).getByRole("button", { name: "Réviser" })).toBeInTheDocument();
  });

  it("shows 'Tout est à jour' and a disabled 'Rien à réviser' button for a course with nothing due", () => {
    render(<Today />);
    const card = screen.getByText("Fonctions quadratiques").closest('[data-testid="course-today-card"]') as HTMLElement;
    expect(within(card).getByText("Tout est à jour")).toBeInTheDocument();
    expect(within(card).getByRole("button", { name: "Rien à réviser" })).toBeDisabled();
    expect(within(card).queryByRole("button", { name: "Réviser" })).not.toBeInTheDocument();
  });

  it("shows each course's countdown badge, the relative form only", () => {
    render(<Today />);
    expect(screen.getByText("Examen dans 8 jours")).toBeInTheDocument();
    expect(screen.getByText("Examen dans 4 jours")).toBeInTheDocument();
    expect(screen.getByText("Examen dans 17 jours")).toBeInTheDocument();
    expect(screen.getByText("Examen dans 11 jours")).toBeInTheDocument();
  });

  it("renders the todos list, an add button, and a delete button per todo naming it", () => {
    render(<Today />);
    expect(screen.getByText("Todos")).toBeInTheDocument();
    expect(screen.getByText("4 restants")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ajouter un todo" })).toBeInTheDocument();

    const label = "Terminer 3 exercices sur les fonctions quadratiques";
    expect(screen.getByText(label)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: `Supprimer « ${label} »` })).toBeInTheDocument();
  });

  it("shows a todo's due date when it has one, and nothing when it doesn't", () => {
    render(<Today />);
    const dated = screen.getByText("Lire la notion « La Terreur »").closest('[data-testid="today-todo-row"]') as HTMLElement;
    expect(within(dated).getByText("8 septembre 2026")).toBeInTheDocument();

    const undated = screen.getByText("Réviser les 12 fiches de Biologie dues aujourd'hui").closest('[data-testid="today-todo-row"]') as HTMLElement;
    expect(within(undated).queryByText(/\d{4}/)).not.toBeInTheDocument();
  });

  it("shows a done todo struck through", () => {
    render(<Today />);
    const done = screen.getByText("Demander au tuteur les carrés de Punnett");
    expect(done.className).toMatch(/line-through/);
  });

  it("renders the pomodoro card with its segmented tabs and a start action", () => {
    render(<Today />);
    expect(screen.getByText("Pomodoro")).toBeInTheDocument();
    expect(screen.getByText("Concentration")).toBeInTheDocument();
    expect(screen.getByText("Pause courte")).toBeInTheDocument();
    expect(screen.getByText("Pause longue")).toBeInTheDocument();
    expect(screen.getByText("25:00")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Démarrer" })).toBeInTheDocument();
  });

  it("renders the study sounds card with the current track and the track list", () => {
    render(<Today />);
    expect(screen.getByText("Sons d'ambiance")).toBeInTheDocument();
    // "Rainy Window" is both the now-playing track and the highlighted row
    // in the list below it — two elements by design, not a duplicate.
    expect(screen.getAllByText("Rainy Window")).toHaveLength(2);
    expect(screen.getByText("Lo-Fi Study Club")).toBeInTheDocument();
    expect(screen.getByText("Deep Focus")).toBeInTheDocument();
  });

  it("renders the sidebar: nav destinations, the streak, and the user chip", () => {
    render(<Today />);
    for (const name of ["Aujourd'hui", "Mes cours", "Notions", "Lecteur", "Progression", "Calendrier", "Tuteur"]) {
      expect(screen.getByRole("button", { name })).toBeInTheDocument();
    }
    expect(screen.getByText("Série de 9 jours")).toBeInTheDocument();
    expect(screen.getByText("Continue comme ça !")).toBeInTheDocument();
    expect(screen.getByText("Léa Martin")).toBeInTheDocument();
    expect(screen.getByText("24 fiches à réviser")).toBeInTheDocument();
  });

  it("the sidebar's own 'Aujourd'hui' row calls onExit — the way back to the real app", async () => {
    const onExit = vi.fn();
    const user = userEvent.setup();
    render(<Today onExit={onExit} />);

    await user.click(screen.getByRole("button", { name: "Aujourd'hui" }));

    expect(onExit).toHaveBeenCalled();
  });
});
