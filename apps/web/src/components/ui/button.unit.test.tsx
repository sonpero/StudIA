// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Button } from "./button.js";

// docs/UI.md's Responsive conventions note: 44px touch targets are a
// deliberate exception to the spacing scale, and every other Button
// variant gets it for free via the shared cva base class (min-h-11).
// A plain text link (the "Retour"/toggle pattern repeated across Notions,
// Lecteur, Progrès, Tuteur) must NOT get a 44px visual box — that
// would change the vertical rhythm of four screens' desktop rendering,
// which M10 Phase 1 requires stay pixel-identical. The only way to reach
// 44px of real tap target without resizing the visible box is a
// pseudo-element, sized and centered independently of the button's own
// box. Asserting on class names is the exception docs/UI.md's own
// Responsive conventions note admits: jsdom renders no layout at all, so
// there is no rendered box to assert on instead.
describe("Button — link variant", () => {
  afterEach(() => {
    cleanup();
  });

  it("does not carry the base min-h-11 touch-target height — a link's own visual box must stay text-sized, not 44px tall", () => {
    render(<Button variant="link">Retour</Button>);
    const button = screen.getByRole("button", { name: "Retour" });
    expect(button.className).not.toMatch(/(?:^|\s)min-h-11(?:\s|$)/);
  });

  it("does not carry the base horizontal/vertical padding (px-4 py-2) — no visible box growth from the shared base", () => {
    render(<Button variant="link">Retour</Button>);
    const button = screen.getByRole("button", { name: "Retour" });
    expect(button.className).not.toMatch(/(?:^|\s)px-4(?:\s|$)/);
    expect(button.className).not.toMatch(/(?:^|\s)py-2(?:\s|$)/);
  });

  it("does not carry the base font-medium weight — must stay the same inherited weight the raw <button> it replaces already rendered at", () => {
    render(<Button variant="link">Retour</Button>);
    const button = screen.getByRole("button", { name: "Retour" });
    expect(button.className).not.toMatch(/(?:^|\s)font-medium(?:\s|$)/);
  });

  it("carries the enlarged hit-zone mechanism: a positioned, centered pseudo-element at least 44px tall, independent of the visible box", () => {
    render(<Button variant="link">Retour</Button>);
    const button = screen.getByRole("button", { name: "Retour" });
    expect(button.className).toMatch(/(?:^|\s)relative(?:\s|$)/);
    expect(button.className).toMatch(/before:absolute/);
    expect(button.className).toMatch(/before:h-11/);
    expect(button.className).toMatch(/before:top-1\/2/);
    expect(button.className).toMatch(/before:-translate-y-1\/2/);
  });

  it("still underlines and mutes the text by default, the look every migrated call site already had", () => {
    render(<Button variant="link">Retour</Button>);
    const button = screen.getByRole("button", { name: "Retour" });
    expect(button.className).toMatch(/(?:^|\s)underline(?:\s|$)/);
    expect(button.className).toMatch(/(?:^|\s)text-text-muted(?:\s|$)/);
  });

  it("a caller-supplied className can still override the default text colour (NotionsScreen's own 'Voir le contenu' needs text-primary)", () => {
    render(
      <Button variant="link" className="text-primary">
        Voir le contenu
      </Button>,
    );
    const button = screen.getByRole("button", { name: "Voir le contenu" });
    expect(button.className).toMatch(/(?:^|\s)text-primary(?:\s|$)/);
    expect(button.className).not.toMatch(/(?:^|\s)text-text-muted(?:\s|$)/);
  });

  it("every other variant keeps the 44px minimum height — the exception is scoped to 'link' alone, not a global removal", () => {
    render(
      <>
        <Button variant="primary">Primary</Button>
        <Button variant="secondary">Secondary</Button>
        <Button variant="accent">Accent</Button>
      </>,
    );
    for (const name of ["Primary", "Secondary", "Accent"]) {
      expect(screen.getByRole("button", { name }).className).toMatch(/(?:^|\s)min-h-11(?:\s|$)/);
    }
  });
});
