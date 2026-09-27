import { describe, expect, it } from "vitest";
import { disambiguateTitles, sectionLabel } from "./disambiguate-titles.js";

describe("disambiguateTitles", () => {
  it("leaves distinct titles untouched", () => {
    expect(
      disambiguateTitles([
        { title: "Photosynthèse", section: "Chapitre 1", part: 1 },
        { title: "Respiration", section: "Chapitre 2", part: 2 },
      ]),
    ).toEqual(["Photosynthèse", "Respiration"]);
  });

  it("keeps the first occurrence and qualifies a later duplicate with its section", () => {
    expect(
      disambiguateTitles([
        { title: "Introduction", section: "Concepts", part: 1 },
        { title: "Introduction", section: "Sécurité", part: 2 },
      ]),
    ).toEqual(["Introduction", "Introduction (Sécurité)"]);
  });

  it("detects collisions case-insensitively, after trimming", () => {
    expect(
      disambiguateTitles([
        { title: "Agent Card", section: null, part: 1 },
        { title: "  agent card ", section: "Découverte", part: 2 },
      ]),
    ).toEqual(["Agent Card", "agent card (Découverte)"]);
  });

  it("falls back to the part number when the chunk has no heading", () => {
    expect(
      disambiguateTitles([
        { title: "Introduction", section: null, part: 1 },
        { title: "Introduction", section: null, part: 3 },
      ]),
    ).toEqual(["Introduction", "Introduction (partie 3)"]);
  });

  it("falls back to the part number when the section says the same as the title", () => {
    expect(
      disambiguateTitles([
        { title: "Sécurité", section: null, part: 1 },
        { title: "Sécurité", section: "sécurité", part: 2 },
      ]),
    ).toEqual(["Sécurité", "Sécurité (partie 2)"]);
  });

  it("adds a counter when the qualified title is itself taken", () => {
    expect(
      disambiguateTitles([
        { title: "Exemple", section: "Streaming", part: 1 },
        { title: "Exemple", section: "Streaming", part: 1 },
        { title: "Exemple", section: "Streaming", part: 1 },
      ]),
    ).toEqual(["Exemple", "Exemple (Streaming)", "Exemple (Streaming 2)"]);
  });

  it("qualifies a later original title that collides with an earlier qualified one", () => {
    expect(
      disambiguateTitles([
        { title: "Tâche", section: null, part: 1 },
        { title: "Tâche", section: "Cycle de vie", part: 2 },
        { title: "Tâche (Cycle de vie)", section: "Cycle de vie", part: 2 },
      ]),
    ).toEqual(["Tâche", "Tâche (Cycle de vie)", "Tâche (Cycle de vie) (Cycle de vie)"]);
  });

  it("never produces a title over 80 characters, and still a unique one", () => {
    const title = "T".repeat(78);
    const section = "S".repeat(70);

    const result = disambiguateTitles([
      { title, section, part: 1 },
      { title, section, part: 2 },
      { title, section, part: 3 },
    ]);

    expect(result.every((t) => t.length <= 80)).toBe(true);
    expect(new Set(result.map((t) => t.toLowerCase())).size).toBe(3);
    expect(result[1]).toBe(`${"T".repeat(80 - 43)} (${"S".repeat(40)})`);
  });

  it("returns an empty list for no titles", () => {
    expect(disambiguateTitles([])).toEqual([]);
  });
});

describe("sectionLabel", () => {
  it("is the chunk's first heading, without its hashes", () => {
    expect(sectionLabel("Intro sans titre.\n\n### Cycle de vie\n\nTexte.\n\n## Autre")).toBe("Cycle de vie");
  });

  it("is null for a chunk without heading", () => {
    expect(sectionLabel("Du texte.\n\nEncore du texte.")).toBeNull();
  });

  it("ignores a #hashtag, which is not a heading", () => {
    expect(sectionLabel("#motclé\n\nTexte.")).toBeNull();
  });

  it("ignores a comment inside a fenced code block", () => {
    expect(sectionLabel("```bash\n# installer le SDK\npip install a2a\n```\n\n## Vrai titre")).toBe("Vrai titre");
    expect(sectionLabel("~~~\n# commentaire\n~~~")).toBeNull();
  });
});
