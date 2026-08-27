import { describe, expect, it } from "vitest";
import { chunkByTopLevelHeadings } from "./chunk-markdown.js";

describe("chunkByTopLevelHeadings", () => {
  it("splits on top-level (#) headings, each chunk starting at its heading", () => {
    const markdown = "# Chapitre 1\n\nContenu 1.\n\n# Chapitre 2\n\nContenu 2.\n";

    expect(chunkByTopLevelHeadings(markdown)).toEqual(["# Chapitre 1\n\nContenu 1.", "# Chapitre 2\n\nContenu 2."]);
  });

  it("does not split on second-level (##) headings", () => {
    const markdown = "# Chapitre 1\n\n## Section A\n\nTexte.\n\n## Section B\n\nTexte.\n";

    expect(chunkByTopLevelHeadings(markdown)).toEqual(["# Chapitre 1\n\n## Section A\n\nTexte.\n\n## Section B\n\nTexte."]);
  });

  it("returns the whole document as one chunk when there is no top-level heading", () => {
    const markdown = "## Only a subsection\n\nTexte sans titre de premier niveau.";

    expect(chunkByTopLevelHeadings(markdown)).toEqual([markdown]);
  });

  it("keeps content preceding the first top-level heading as its own leading chunk", () => {
    const markdown = "Préambule.\n\n# Chapitre 1\n\nContenu.";

    expect(chunkByTopLevelHeadings(markdown)).toEqual(["Préambule.", "# Chapitre 1\n\nContenu."]);
  });

  it("returns an empty array for empty input", () => {
    expect(chunkByTopLevelHeadings("")).toEqual([]);
  });
});
