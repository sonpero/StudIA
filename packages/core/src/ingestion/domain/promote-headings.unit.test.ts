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

  // PDF extraction breaks sentences, table cells and inline code across
  // lines; these fragments are short and often unpunctuated, but a heading
  // never has any of the shapes below.
  const LONGER = "Une ligne suivante nettement plus longue que le fragment qui la précède.";

  it.each([
    ["ends with a comma: a sentence continues on the next line", "A2A est le standard ouvert,"],
    ["starts with a lowercase letter: the tail of a broken sentence", "construits par des équipes"],
    ["starts with a lowercase accented letter", "équivalents fonctionnellement"],
    ["is a code identifier", "taskId"],
    ["starts with a closing or continuation punctuation mark", ", opaque pour le client"],
    ["starts with a period", ". Une tâche en"],
    ["starts with a closing parenthesis", ") sur chaque requête"],
    ["starts with a colon", ": le client choisit"],
    ["contains no letter at all", "{"],
    ["contains no letter at all (a version number)", "1.0"],
  ])("does not promote a line that %s", (_why, line) => {
    expect(promoteHeadings(`${line}\n${LONGER}`)).not.toContain("##");
  });

  it("still promotes a numbered section title", () => {
    expect(promoteHeadings(`2. Concepts fondamentaux\n${LONGER}`)).toBe(`## 2. Concepts fondamentaux\n\n${LONGER}`);
  });

  it("still promotes a title starting with an uppercase accented letter or an opening parenthesis", () => {
    expect(promoteHeadings(`État des lieux\n${LONGER}`)).toContain("## État des lieux");
    expect(promoteHeadings(`(A2A) en bref\n${LONGER}`)).toContain("## (A2A) en bref");
  });
});
