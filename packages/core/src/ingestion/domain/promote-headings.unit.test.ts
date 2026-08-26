import { describe, expect, it } from "vitest";
import { promoteHeadings } from "./promote-headings.js";

describe("promoteHeadings", () => {
  it("promotes a short line with no sentence-ending punctuation, followed by a longer line, to a heading", () => {
    const input = "La photosynthese\nLa photosynthese est le processus par lequel les plantes convertissent la lumiere.";

    expect(promoteHeadings(input)).toBe(
      "## La photosynthese\n\nLa photosynthese est le processus par lequel les plantes convertissent la lumiere.",
    );
  });

  it("does not promote a normal sentence even if short", () => {
    const input = "Il fait beau.\nEt voila une deuxieme phrase plus longue qui suit la premiere sans probleme.";

    expect(promoteHeadings(input)).not.toContain("##");
  });

  it("does not promote the last line (nothing follows it to compare length against)", () => {
    const input = "Une phrase normale qui precede.\nConclusion";

    expect(promoteHeadings(input)).not.toContain("##");
  });

  it("handles multiple headings in one document", () => {
    const input = ["Introduction", "Ceci est le paragraphe d'introduction qui est assez long.", "Conclusion", "Ceci est le paragraphe de conclusion, lui aussi assez long."].join(
      "\n",
    );

    const result = promoteHeadings(input);

    expect(result).toContain("## Introduction");
    expect(result).toContain("## Conclusion");
  });

  it("drops blank lines and trims whitespace", () => {
    const input = "  Titre  \n\n\n  Un paragraphe assez long qui suit le titre sans souci particulier.  ";

    expect(promoteHeadings(input)).toBe("## Titre\n\nUn paragraphe assez long qui suit le titre sans souci particulier.");
  });
});
