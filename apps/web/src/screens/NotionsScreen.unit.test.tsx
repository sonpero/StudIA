// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NotionsScreen } from "./NotionsScreen.js";

function renderScreen(overrides: Partial<{ onOpenReader: () => void }> = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <NotionsScreen
        documentId="doc-1"
        onBack={() => undefined}
        onReview={() => undefined}
        onOpenProgress={() => undefined}
        onOpenReader={overrides.onOpenReader ?? (() => undefined)}
      />
    </QueryClientProvider>,
  );
}

const aNotion = { id: "n1", documentId: "doc-1", userId: "u1", title: "Photosynthèse", body: "La plante capte la lumière.", difficulty: "medium" as const, position: 0, createdAt: "2026-01-01T00:00:00Z" };

describe("NotionsScreen", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("loading state: shows skeleton placeholders while notions are being fetched", () => {
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(new Promise(() => {})));

    renderScreen();

    expect(screen.getByText("Notions du cours")).toBeInTheDocument();
    expect(screen.queryByText(/pas encore été créées/i)).not.toBeInTheDocument();
  });

  it("error state: shows the confused mascot and an explicit message, with a retry action", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 500 })));

    renderScreen();

    expect(await screen.findByText(/impossible de charger les notions/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /réessayer/i })).toBeInTheDocument();
  });

  it("empty state: invites the user back, never 'aucun résultat'", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify([]), { status: 200 })));

    renderScreen();

    expect(await screen.findByText(/pas encore été créées/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /retour à mes cours/i })).toBeInTheDocument();
    expect(screen.queryByText(/^aucun résultat$/i)).not.toBeInTheDocument();
  });

  it("the gap between the title (or the header row) and what follows it is the same --space-section token in every state (docs/UI.md's Grid and spacing note)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(new Promise(() => {})));
    renderScreen();
    expect(screen.getByText("Notions du cours").className).toMatch(/mb-\[var\(--space-section\)\]/);
    cleanup();

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 500 })));
    renderScreen();
    await screen.findByText(/impossible de charger les notions/i);
    const errorMain = screen.getByRole("heading", { name: "Notions du cours" }).closest("main");
    expect(errorMain?.className).toMatch(/gap-\[var\(--space-section\)\]/);
    cleanup();

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify([]), { status: 200 })));
    renderScreen();
    await screen.findByText(/pas encore été créées/i);
    const emptyMain = screen.getByRole("heading", { name: "Notions du cours" }).closest("main");
    expect(emptyMain?.className).toMatch(/gap-\[var\(--space-section\)\]/);
    cleanup();

    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        if (url.includes("/notions-progress")) return Promise.resolve(new Response(JSON.stringify([{ notionId: "n1", masteredCards: 1, totalCards: 4 }]), { status: 200 }));
        if (url.includes("/progress")) return Promise.resolve(new Response(JSON.stringify({ mastered: 2, total: 5 }), { status: 200 }));
        return Promise.resolve(new Response(JSON.stringify([aNotion]), { status: 200 }));
      }),
    );
    renderScreen();
    await screen.findByText("Photosynthèse");
    // The title is now a direct child of the header row (no longer wrapped
    // with "Retour à mes cours" in its own inner div, docs/UI.md's Notions
    // du cours note), so the row is one closest("div") away, not two.
    const headerRow = screen.getByRole("heading", { name: "Notions du cours" }).closest("div");
    expect(headerRow?.className).toMatch(/mb-\[var\(--space-section\)\]/);
  });

  it("ready state: lists the document's notions with their difficulty, and shows progress", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        if (url.includes("/notions-progress")) return Promise.resolve(new Response(JSON.stringify([{ notionId: "n1", masteredCards: 1, totalCards: 4 }]), { status: 200 }));
        if (url.includes("/progress")) return Promise.resolve(new Response(JSON.stringify({ mastered: 2, total: 5 }), { status: 200 }));
        return Promise.resolve(new Response(JSON.stringify([aNotion]), { status: 200 }));
      }),
    );

    renderScreen();

    expect(await screen.findByText("Photosynthèse")).toBeInTheDocument();
    expect(screen.getByText("Moyen")).toBeInTheDocument();
    // The mastered count and its qualifier are now separate elements
    // (docs/UI.md's Type note: the number dominates), so each is asserted
    // on its own rather than as one text run.
    expect(await screen.findByText("2")).toBeInTheDocument();
    expect(screen.getByText("/ 5 notions maîtrisées")).toBeInTheDocument();
  });

  it("ready state: the mastered-notions count is the dominant number on its line, --text-display, its qualifier small and muted; a notion's own title is --text-title (docs/UI.md's Type note)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        if (url.includes("/notions-progress")) return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
        if (url.includes("/progress")) return Promise.resolve(new Response(JSON.stringify({ mastered: 2, total: 5 }), { status: 200 }));
        return Promise.resolve(new Response(JSON.stringify([aNotion]), { status: 200 }));
      }),
    );

    renderScreen();
    await screen.findByText("Photosynthèse");

    const count = screen.getByText("2");
    expect(count.className).toContain("text-[length:var(--text-display)]");
    const qualifier = screen.getByText("/ 5 notions maîtrisées");
    expect(qualifier.className).toContain("text-[length:var(--text-label)]");
    const title = screen.getByText("Photosynthèse");
    expect(title.className).toContain("text-[length:var(--text-title)]");
  });

  it("ready state: 'Types de fiches à créer' is a section label, --text-label, not body text (docs/UI.md's Type note)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        if (url.includes("/notions-progress")) return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
        if (url.includes("/progress")) return Promise.resolve(new Response(JSON.stringify({ mastered: 0, total: 1 }), { status: 200 }));
        return Promise.resolve(new Response(JSON.stringify([aNotion]), { status: 200 }));
      }),
    );

    renderScreen();
    await screen.findByText("Photosynthèse");

    expect(screen.getByText("Types de fiches à créer").className).toContain("text-[length:var(--text-label)]");
  });

  it("ready state: the toolbar's 'Réviser' is --accent, the same colour as every notion card's own 'Réviser cette notion' — the same word names the same gesture on this screen (docs/UI.md's Colour note, reversed from an earlier version of this pass)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        if (url.includes("/notions-progress")) return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
        if (url.includes("/progress")) return Promise.resolve(new Response(JSON.stringify({ mastered: 0, total: 1 }), { status: 200 }));
        return Promise.resolve(new Response(JSON.stringify([aNotion]), { status: 200 }));
      }),
    );

    renderScreen();
    await screen.findByText("Photosynthèse");

    const reviewButton = screen.getByRole("button", { name: "Réviser" });
    expect(reviewButton.className).toMatch(/bg-accent/);
    expect(reviewButton.className).toMatch(/text-white/);
  });

  it("ready state: 'Lire le cours' and 'Voir la progression' are plain underlined links, not Buttons — they leave this screen for another one, so they demote the same way 'Retour à mes cours' already does (docs/UI.md's Shape and depth note)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        if (url.includes("/notions-progress")) return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
        if (url.includes("/progress")) return Promise.resolve(new Response(JSON.stringify({ mastered: 0, total: 1 }), { status: 200 }));
        return Promise.resolve(new Response(JSON.stringify([aNotion]), { status: 200 }));
      }),
    );

    renderScreen();
    await screen.findByText("Photosynthèse");

    for (const name of ["Lire le cours", "Voir la progression"]) {
      const link = screen.getByRole("button", { name });
      expect(link.className).toMatch(/underline/);
      expect(link.className).not.toMatch(/border-border/);
      expect(link.className).not.toMatch(/bg-accent/);
    }
  });

  it("ready state: offers 'Lire le cours', opening the reader for this document", async () => {
    const onOpenReader = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        if (url.includes("/notions-progress")) return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
        if (url.includes("/progress")) return Promise.resolve(new Response(JSON.stringify({ mastered: 0, total: 1 }), { status: 200 }));
        return Promise.resolve(new Response(JSON.stringify([aNotion]), { status: 200 }));
      }),
    );
    const user = userEvent.setup();

    renderScreen({ onOpenReader });
    await screen.findByText("Photosynthèse");

    await user.click(screen.getByRole("button", { name: "Lire le cours" }));

    expect(onOpenReader).toHaveBeenCalled();
  });

  it("ready state: 'Créer les fiches' (or 'Régénérer les fiches' once cards exist) sits apart from the common toolbar actions — rare, and destructive once it reads 'Régénérer', so not the same visual level as Lire le cours / Voir la progression / Réviser", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        if (url.includes("/notions-progress")) return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
        if (url.includes("/progress")) return Promise.resolve(new Response(JSON.stringify({ mastered: 0, total: 1 }), { status: 200 }));
        return Promise.resolve(new Response(JSON.stringify([aNotion]), { status: 200 }));
      }),
    );

    renderScreen();
    await screen.findByText("Photosynthèse");

    const toolbar = screen.getByTestId("notions-toolbar");
    expect(within(toolbar).getByRole("button", { name: "Lire le cours" })).toBeInTheDocument();
    expect(within(toolbar).getByRole("button", { name: "Voir la progression" })).toBeInTheDocument();
    expect(within(toolbar).getByRole("button", { name: "Réviser" })).toBeInTheDocument();
    expect(within(toolbar).queryByRole("button", { name: /créer les fiches|régénérer les fiches/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Créer les fiches" })).toBeInTheDocument();
  });

  it("ready state: 'Créer les fiches' sits before 'Types de fiches à créer', not after it", async () => {
    // No accessible role distinguishes "before" from "after" in a
    // flex-wrap row (docs/TESTING.md's exception for structure with no
    // accessible trace): document position is the only way to assert this.
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        if (url.includes("/notions-progress")) return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
        if (url.includes("/progress")) return Promise.resolve(new Response(JSON.stringify({ mastered: 0, total: 1 }), { status: 200 }));
        return Promise.resolve(new Response(JSON.stringify([aNotion]), { status: 200 }));
      }),
    );

    renderScreen();
    await screen.findByText("Photosynthèse");

    const button = screen.getByRole("button", { name: "Créer les fiches" });
    const fieldset = screen.getByText("Types de fiches à créer").closest("fieldset");

    expect(button.compareDocumentPosition(fieldset!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("ready state: offers a way back to the courses list (not just the empty/error states)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        if (url.includes("/notions-progress")) return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
        if (url.includes("/progress")) return Promise.resolve(new Response(JSON.stringify({ mastered: 0, total: 1 }), { status: 200 }));
        return Promise.resolve(new Response(JSON.stringify([aNotion]), { status: 200 }));
      }),
    );
    const user = userEvent.setup();
    const onBack = vi.fn();
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <NotionsScreen documentId="doc-1" onBack={onBack} onReview={() => undefined} onOpenProgress={() => undefined} onOpenReader={() => undefined} />
      </QueryClientProvider>,
    );
    await screen.findByText("Photosynthèse");

    await user.click(screen.getByRole("button", { name: /retour à mes cours/i }));

    expect(onBack).toHaveBeenCalled();
  });

  it("ready state: 'Retour à mes cours' sits after the toolbar's own actions (Lire le cours / Voir la progression / Réviser), not in front of the title (docs/UI.md's Notions du cours note)", async () => {
    // Same exception as the 'Créer les fiches' position test above:
    // document position is the only way to assert "after", nothing
    // accessible distinguishes it.
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        if (url.includes("/notions-progress")) return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
        if (url.includes("/progress")) return Promise.resolve(new Response(JSON.stringify({ mastered: 0, total: 1 }), { status: 200 }));
        return Promise.resolve(new Response(JSON.stringify([aNotion]), { status: 200 }));
      }),
    );

    renderScreen();
    await screen.findByText("Photosynthèse");

    const back = screen.getByRole("button", { name: /retour à mes cours/i });
    const reviser = within(screen.getByTestId("notions-toolbar")).getByRole("button", { name: "Réviser" });

    expect(reviser.compareDocumentPosition(back) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("ready state: tab order visits the toolbar's three actions, then 'Retour à mes cours' last", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        if (url.includes("/notions-progress")) return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
        if (url.includes("/progress")) return Promise.resolve(new Response(JSON.stringify({ mastered: 0, total: 1 }), { status: 200 }));
        return Promise.resolve(new Response(JSON.stringify([aNotion]), { status: 200 }));
      }),
    );
    const user = userEvent.setup();
    renderScreen();
    await screen.findByText("Photosynthèse");

    const toolbar = screen.getByTestId("notions-toolbar");
    within(toolbar).getByRole("button", { name: "Lire le cours" }).focus();
    expect(within(toolbar).getByRole("button", { name: "Lire le cours" })).toHaveFocus();

    await user.tab();
    expect(within(toolbar).getByRole("button", { name: "Voir la progression" })).toHaveFocus();

    await user.tab();
    expect(within(toolbar).getByRole("button", { name: "Réviser" })).toHaveFocus();

    await user.tab();
    expect(screen.getByRole("button", { name: /retour à mes cours/i })).toHaveFocus();
  });

  it("ready state: shows each notion's own mastery progress, with a distinct label when it has no cards yet", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        if (url.includes("/notions-progress")) return Promise.resolve(new Response(JSON.stringify([{ notionId: "n1", masteredCards: 1, totalCards: 4 }]), { status: 200 }));
        if (url.includes("/progress")) return Promise.resolve(new Response(JSON.stringify({ mastered: 0, total: 1 }), { status: 200 }));
        return Promise.resolve(new Response(JSON.stringify([aNotion]), { status: 200 }));
      }),
    );

    renderScreen();

    expect(await screen.findByText("1 / 4 fiches maîtrisées")).toBeInTheDocument();
  });

  it("ready state: a notion with no cards yet shows an inviting label, not a 0/0 count", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        if (url.includes("/notions-progress")) return Promise.resolve(new Response(JSON.stringify([{ notionId: "n1", masteredCards: 0, totalCards: 0 }]), { status: 200 }));
        if (url.includes("/progress")) return Promise.resolve(new Response(JSON.stringify({ mastered: 0, total: 1 }), { status: 200 }));
        return Promise.resolve(new Response(JSON.stringify([aNotion]), { status: 200 }));
      }),
    );

    renderScreen();

    expect(await screen.findByText("Pas encore de fiches")).toBeInTheDocument();
    expect(screen.queryByText(/^0 \/ 0/)).not.toBeInTheDocument();
  });

  it("ready state: a notion at 0 / 3 fiches maîtrisées still explains why — the most common case, not an edge case (docs/UI.md's Notions du cours note)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        if (url.includes("/notions-progress")) {
          return Promise.resolve(
            new Response(JSON.stringify([{ notionId: "n1", masteredCards: 0, totalCards: 3, cardsWithEnoughReps: 1, cardsWithEnoughStability: 2 }]), { status: 200 }),
          );
        }
        if (url.includes("/progress")) return Promise.resolve(new Response(JSON.stringify({ mastered: 0, total: 1 }), { status: 200 }));
        return Promise.resolve(new Response(JSON.stringify([aNotion]), { status: 200 }));
      }),
    );

    renderScreen();

    expect(await screen.findByText("Il te manque encore des révisions sur cette notion.")).toBeInTheDocument();
    expect(screen.getByText(/1\/3 fiches ont fait 3 révisions/)).toBeInTheDocument();
    expect(screen.getByText(/2\/3 fiches ont dépassé 21 jours de stabilité/)).toBeInTheDocument();
  });

  it("ready state: once every card has enough reps, a notion still short of mastery explains the stability gap instead, stating the mechanism rather than inviting inaction", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        if (url.includes("/notions-progress")) {
          return Promise.resolve(
            new Response(JSON.stringify([{ notionId: "n1", masteredCards: 2, totalCards: 3, cardsWithEnoughReps: 3, cardsWithEnoughStability: 2 }]), { status: 200 }),
          );
        }
        if (url.includes("/progress")) return Promise.resolve(new Response(JSON.stringify({ mastered: 0, total: 1 }), { status: 200 }));
        return Promise.resolve(new Response(JSON.stringify([aNotion]), { status: 200 }));
      }),
    );

    renderScreen();

    expect(await screen.findByText("Tu l'as révisée assez souvent, il faut maintenant l'espacer dans le temps.")).toBeInTheDocument();
    expect(screen.queryByText(/il te manque encore des révisions/i)).not.toBeInTheDocument();
  });

  it("ready state: a fully mastered notion shows no mastery-gap explanation at all", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        if (url.includes("/notions-progress")) {
          return Promise.resolve(
            new Response(JSON.stringify([{ notionId: "n1", masteredCards: 3, totalCards: 3, cardsWithEnoughReps: 3, cardsWithEnoughStability: 3 }]), { status: 200 }),
          );
        }
        if (url.includes("/progress")) return Promise.resolve(new Response(JSON.stringify({ mastered: 1, total: 1 }), { status: 200 }));
        return Promise.resolve(new Response(JSON.stringify([aNotion]), { status: 200 }));
      }),
    );

    renderScreen();

    await screen.findByText("3 / 3 fiches maîtrisées");
    expect(screen.queryByText(/il te manque encore des révisions/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/espacer dans le temps/i)).not.toBeInTheDocument();
  });

  // "fiche(s)" and its verb agree with the denominator (docs/UI.md's Notions
  // du cours note: "X/Y fiches ont …" reads as "X out of Y fiches"), not
  // the numerator: 0/3 and 1/3 both name a population of 3, so both stay
  // plural. An earlier version agreed with the numerator instead, so both
  // of these cases read as a false singular.
  it("ready state: 'fiche(s)' and its verb agree with the denominator, not the numerator — 0/3 and 1/3 both stay plural", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        if (url.includes("/notions-progress")) {
          return Promise.resolve(
            new Response(JSON.stringify([{ notionId: "n1", masteredCards: 0, totalCards: 3, cardsWithEnoughReps: 0, cardsWithEnoughStability: 1 }]), { status: 200 }),
          );
        }
        if (url.includes("/progress")) return Promise.resolve(new Response(JSON.stringify({ mastered: 0, total: 1 }), { status: 200 }));
        return Promise.resolve(new Response(JSON.stringify([aNotion]), { status: 200 }));
      }),
    );

    renderScreen();

    expect(await screen.findByText(/0\/3 fiches ont fait 3 révisions/)).toBeInTheDocument();
    expect(screen.getByText(/1\/3 fiches ont dépassé 21 jours de stabilité/)).toBeInTheDocument();
  });

  it("ready state: singular is only ever correct when the notion itself has exactly one fiche — 0/1 and 1/1 both stay singular", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        if (url.includes("/notions-progress")) {
          return Promise.resolve(
            new Response(JSON.stringify([{ notionId: "n1", masteredCards: 0, totalCards: 1, cardsWithEnoughReps: 0, cardsWithEnoughStability: 1 }]), { status: 200 }),
          );
        }
        if (url.includes("/progress")) return Promise.resolve(new Response(JSON.stringify({ mastered: 0, total: 1 }), { status: 200 }));
        return Promise.resolve(new Response(JSON.stringify([aNotion]), { status: 200 }));
      }),
    );

    renderScreen();

    expect(await screen.findByText(/0\/1 fiche a fait 3 révisions/)).toBeInTheDocument();
    expect(screen.getByText(/1\/1 fiche a dépassé 21 jours de stabilité/)).toBeInTheDocument();
  });

  it("ready state: the mastery-gap explanation is never coloured or larger than its own sentence — a fact, not a warning (docs/UI.md's Colour note)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        if (url.includes("/notions-progress")) {
          return Promise.resolve(
            new Response(JSON.stringify([{ notionId: "n1", masteredCards: 0, totalCards: 3, cardsWithEnoughReps: 1, cardsWithEnoughStability: 2 }]), { status: 200 }),
          );
        }
        if (url.includes("/progress")) return Promise.resolve(new Response(JSON.stringify({ mastered: 0, total: 1 }), { status: 200 }));
        return Promise.resolve(new Response(JSON.stringify([aNotion]), { status: 200 }));
      }),
    );

    renderScreen();

    const sentence = await screen.findByText("Il te manque encore des révisions sur cette notion.");
    expect(sentence.className).not.toMatch(/warning/);
    expect(sentence.className).toContain("text-sm");

    const detail = screen.getByText(/1\/3 fiches ont fait 3 révisions/);
    expect(detail.className).not.toMatch(/warning/);
    expect(detail.className).toContain("text-[length:var(--text-label)]");
  });

  it("ready state: the notion's body is hidden by default and revealed on demand", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        if (url.includes("/notions-progress")) return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
        if (url.includes("/progress")) return Promise.resolve(new Response(JSON.stringify({ mastered: 0, total: 1 }), { status: 200 }));
        return Promise.resolve(new Response(JSON.stringify([aNotion]), { status: 200 }));
      }),
    );
    const user = userEvent.setup();

    renderScreen();
    await screen.findByText("Photosynthèse");
    expect(screen.queryByText("La plante capte la lumière.")).not.toBeInTheDocument();

    await user.click(screen.getByText("Voir le contenu"));

    expect(screen.getByText("La plante capte la lumière.")).toBeInTheDocument();
  });

  it("ready state: the notion's body renders as formatted markdown, not raw text — bold and a numbered list included (notion.body is markdown, same as the reader's own content)", async () => {
    const richNotion = { ...aNotion, body: "Il y a **deux** phases :\n\n1. Phase claire\n2. Cycle de Calvin" };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        if (url.includes("/notions-progress")) return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
        if (url.includes("/progress")) return Promise.resolve(new Response(JSON.stringify({ mastered: 0, total: 1 }), { status: 200 }));
        return Promise.resolve(new Response(JSON.stringify([richNotion]), { status: 200 }));
      }),
    );
    const user = userEvent.setup();

    renderScreen();
    await screen.findByText("Photosynthèse");
    await user.click(screen.getByText("Voir le contenu"));

    const strong = await screen.findByText("deux");
    expect(strong.tagName).toBe("STRONG");
    const items = screen.getAllByRole("listitem");
    expect(items.map((li) => li.textContent)).toEqual(["Phase claire", "Cycle de Calvin"]);
    // Raw markdown syntax must not leak through as literal characters.
    expect(screen.queryByText(/\*\*/)).not.toBeInTheDocument();
    expect(screen.queryByText(/^1\./)).not.toBeInTheDocument();
  });

  it("a notion card's 'Réviser cette notion' and the toolbar's 'Réviser' are both --accent, the identical gesture at two scopes — this does not put two accents inside one card, since the toolbar's own button sits outside every card (docs/UI.md's Colour note)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        if (url.includes("/notions-progress")) return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
        if (url.includes("/progress")) return Promise.resolve(new Response(JSON.stringify({ mastered: 0, total: 1 }), { status: 200 }));
        return Promise.resolve(new Response(JSON.stringify([aNotion]), { status: 200 }));
      }),
    );
    renderScreen();
    await screen.findByText("Photosynthèse");

    const perNotion = screen.getByRole("button", { name: "Réviser cette notion" });
    expect(perNotion.className).toMatch(/bg-accent/);
    expect(perNotion.className).toMatch(/text-white/);

    const toolbar = screen.getByRole("button", { name: "Réviser" });
    expect(toolbar.className).toMatch(/bg-accent/);

    // The invariant that actually matters — never more than one accent
    // element inside a single card — still holds: the toolbar's own
    // accent button is not a descendant of the notion card at all.
    const notionCard = screen.getByTestId("notion-card");
    expect(within(notionCard).getAllByRole("button").filter((b) => /bg-accent/.test(b.className))).toHaveLength(1);
    expect(notionCard).not.toContainElement(toolbar);
  });

  it("clicking 'Réviser cette notion' starts a review scoped to that notion", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        if (url.includes("/notions-progress")) return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
        if (url.includes("/progress")) return Promise.resolve(new Response(JSON.stringify({ mastered: 0, total: 1 }), { status: 200 }));
        return Promise.resolve(new Response(JSON.stringify([aNotion]), { status: 200 }));
      }),
    );
    const user = userEvent.setup();
    const onReview = vi.fn();
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <NotionsScreen documentId="doc-1" onBack={() => undefined} onReview={onReview} onOpenProgress={() => undefined} onOpenReader={() => undefined} />
      </QueryClientProvider>,
    );
    await screen.findByText("Photosynthèse");

    await user.click(screen.getByRole("button", { name: /réviser cette notion/i }));

    expect(onReview).toHaveBeenCalledWith("n1");
  });

  it("a notion card's 'Réviser cette notion' pairs a decorative icon with its label — the accessible name stays exactly the label (docs/UI.md's Icons note)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        if (url.includes("/notions-progress")) return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
        if (url.includes("/progress")) return Promise.resolve(new Response(JSON.stringify({ mastered: 0, total: 1 }), { status: 200 }));
        return Promise.resolve(new Response(JSON.stringify([aNotion]), { status: 200 }));
      }),
    );
    renderScreen();
    await screen.findByText("Photosynthèse");

    const button = screen.getByRole("button", { name: "Réviser cette notion" });
    const icon = button.querySelector("svg");
    expect(icon).not.toBeNull();
    expect(icon).toHaveAttribute("aria-hidden", "true");
    expect(icon).toHaveAttribute("focusable", "false");
  });

  it("polls while there are no notions yet, and shows them once splitting finishes", async () => {
    let notionsCallCount = 0;
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/notions-progress")) return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
      if (url.includes("/progress")) return Promise.resolve(new Response(JSON.stringify({ mastered: 0, total: 0 }), { status: 200 }));
      notionsCallCount += 1;
      // Empty at first (splitting still running), then populated — proves
      // the screen keeps polling instead of getting stuck on "empty"
      // forever (docs/UI.md: never block the UI on a job).
      const body = notionsCallCount === 1 ? [] : [aNotion];
      return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
    });
    vi.stubGlobal("fetch", fetchMock);

    renderScreen();

    await screen.findByText(/pas encore été créées/i);
    await waitFor(() => expect(notionsCallCount).toBeGreaterThan(1), { timeout: 4000 });
    expect(await screen.findByText("Photosynthèse")).toBeInTheDocument();
  });

  it("requesting generation calls the whole-document generate endpoint", async () => {
    const user = userEvent.setup();
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string, init?: RequestInit) => {
        calls.push(`${init?.method ?? "GET"} ${url}`);
        if (url.includes("/notions-progress")) return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
        if (url.includes("/progress")) return Promise.resolve(new Response(JSON.stringify({ mastered: 0, total: 1 }), { status: 200 }));
        if (url.includes("/generation-status")) return Promise.resolve(new Response(JSON.stringify({ done: 1, total: 1, failed: 0 }), { status: 200 }));
        if (url.includes("/generate")) return Promise.resolve(new Response(JSON.stringify({ jobIds: ["j1"] }), { status: 202 }));
        return Promise.resolve(new Response(JSON.stringify([aNotion]), { status: 200 }));
      }),
    );

    renderScreen();
    await screen.findByText("Photosynthèse");
    await user.click(screen.getByRole("button", { name: /créer les fiches/i }));

    expect(calls).toContainEqual("POST /api/documents/doc-1/generate");
  });

  it("generation: defaults to flashcards only, and sends the user's chosen types (docs/modules/generation.md: 'user choice in M4')", async () => {
    const user = userEvent.setup();
    const bodies: unknown[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string, init?: RequestInit) => {
        if (url.includes("/generate") && init?.method === "POST") bodies.push(init.body ? JSON.parse(init.body as string) : undefined);
        if (url.includes("/notions-progress")) return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
        if (url.includes("/progress")) return Promise.resolve(new Response(JSON.stringify({ mastered: 0, total: 1 }), { status: 200 }));
        if (url.includes("/generation-status")) return Promise.resolve(new Response(JSON.stringify({ done: 1, total: 1, failed: 0 }), { status: 200 }));
        if (url.includes("/generate")) return Promise.resolve(new Response(JSON.stringify({ jobIds: ["j1"] }), { status: 202 }));
        return Promise.resolve(new Response(JSON.stringify([aNotion]), { status: 200 }));
      }),
    );

    renderScreen();
    await screen.findByText("Photosynthèse");
    expect(screen.getByRole("checkbox", { name: "Flashcards" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "QCM" })).not.toBeChecked();

    await user.click(screen.getByRole("button", { name: /créer les fiches/i }));
    expect(bodies).toEqual([{ types: ["flashcard"] }]);

    await user.click(screen.getByRole("checkbox", { name: "QCM" }));
    await user.click(screen.getByRole("checkbox", { name: "Questions ouvertes" }));
    await user.click(screen.getByRole("button", { name: /créer les fiches/i }));

    expect(bodies).toContainEqual({ types: ["flashcard", "mcq", "open"] });
  });

  it("generation: unchecking every type disables the button", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        if (url.includes("/notions-progress")) return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
        if (url.includes("/progress")) return Promise.resolve(new Response(JSON.stringify({ mastered: 0, total: 1 }), { status: 200 }));
        return Promise.resolve(new Response(JSON.stringify([aNotion]), { status: 200 }));
      }),
    );

    renderScreen();
    await screen.findByText("Photosynthèse");

    await user.click(screen.getByRole("checkbox", { name: "Flashcards" }));

    expect(screen.getByRole("button", { name: /créer les fiches/i })).toBeDisabled();
  });

  it("generation: disables the button and shows an in-progress state while cards are being created", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        if (url.includes("/notions-progress")) return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
        if (url.includes("/progress")) return Promise.resolve(new Response(JSON.stringify({ mastered: 0, total: 1 }), { status: 200 }));
        // Never resolves "done": the status stays in progress for the
        // whole test, so the loading state is observable, not a flash.
        if (url.includes("/generation-status")) return Promise.resolve(new Response(JSON.stringify({ done: 1, total: 3, failed: 0 }), { status: 200 }));
        if (url.includes("/generate")) return Promise.resolve(new Response(JSON.stringify({ jobIds: ["j1", "j2", "j3"] }), { status: 202 }));
        return Promise.resolve(new Response(JSON.stringify([aNotion]), { status: 200 }));
      }),
    );

    renderScreen();
    await screen.findByText("Photosynthèse");
    await user.click(screen.getByRole("button", { name: /créer les fiches/i }));

    expect(await screen.findByText(/création en cours/i)).toBeInTheDocument();
    expect(await screen.findByText(/1 \/ 3/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /création en cours/i })).toBeDisabled();
  });

  it("generation: tracks progress via generation-status and invalidates notions/progress once done", async () => {
    const user = userEvent.setup();
    let statusCalls = 0;
    let notionsProgressCalls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        if (url.includes("/notions-progress")) {
          notionsProgressCalls += 1;
          return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
        }
        if (url.includes("/progress")) return Promise.resolve(new Response(JSON.stringify({ mastered: 0, total: 1 }), { status: 200 }));
        if (url.includes("/generation-status")) {
          statusCalls += 1;
          const body = statusCalls === 1 ? { done: 1, total: 3, failed: 0 } : { done: 3, total: 3, failed: 0 };
          return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
        }
        if (url.includes("/generate")) return Promise.resolve(new Response(JSON.stringify({ jobIds: ["j1", "j2", "j3"] }), { status: 202 }));
        return Promise.resolve(new Response(JSON.stringify([aNotion]), { status: 200 }));
      }),
    );

    renderScreen();
    await screen.findByText("Photosynthèse");
    const notionsProgressCallsBefore = notionsProgressCalls;
    await user.click(screen.getByRole("button", { name: /créer les fiches/i }));

    expect(await screen.findByText(/1 \/ 3/)).toBeInTheDocument();
    // Once done/total match, the button returns to normal and the
    // notions-progress query (consumed by every notion's mastery label)
    // gets invalidated, proving the refresh actually happened.
    await waitFor(() => expect(screen.getByRole("button", { name: /créer les fiches/i })).not.toBeDisabled(), { timeout: 4000 });
    await waitFor(() => expect(notionsProgressCalls).toBeGreaterThan(notionsProgressCallsBefore), { timeout: 4000 });
  });

  it("generation: shows an error and re-enables the button if starting generation fails", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        if (url.includes("/notions-progress")) return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
        if (url.includes("/progress")) return Promise.resolve(new Response(JSON.stringify({ mastered: 0, total: 1 }), { status: 200 }));
        if (url.includes("/generate")) return Promise.resolve(new Response(null, { status: 500 }));
        return Promise.resolve(new Response(JSON.stringify([aNotion]), { status: 200 }));
      }),
    );

    renderScreen();
    await screen.findByText("Photosynthèse");
    await user.click(screen.getByRole("button", { name: /créer les fiches/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/impossible de créer les fiches/i);
    expect(screen.getByRole("button", { name: /créer les fiches/i })).not.toBeDisabled();
  });

  it("generation: renames the button to 'Régénérer les fiches' once every notion already has cards", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        if (url.includes("/notions-progress")) return Promise.resolve(new Response(JSON.stringify([{ notionId: "n1", masteredCards: 1, totalCards: 3 }]), { status: 200 }));
        if (url.includes("/progress")) return Promise.resolve(new Response(JSON.stringify({ mastered: 0, total: 1 }), { status: 200 }));
        return Promise.resolve(new Response(JSON.stringify([aNotion]), { status: 200 }));
      }),
    );

    renderScreen();

    expect(await screen.findByRole("button", { name: /régénérer les fiches/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^créer les fiches$/i })).not.toBeInTheDocument();
  });
});
