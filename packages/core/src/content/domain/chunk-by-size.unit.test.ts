import { describe, expect, it } from "vitest";
import { chunkBySize, DEFAULT_CHUNKING } from "./chunk-by-size.js";

const small = { targetChars: 100, maxChars: 150 };

// A paragraph of exactly `length` characters, distinguishable by `tag`.
function para(tag: string, length: number): string {
  return `${tag} ${"x".repeat(Math.max(0, length - tag.length - 1))}`;
}

function doc(...blocks: string[]): string {
  return blocks.join("\n\n");
}

describe("chunkBySize", () => {
  it("returns no chunk for an empty or blank document", () => {
    expect(chunkBySize("", small)).toEqual([]);
    expect(chunkBySize("  \n\n \n", small)).toEqual([]);
  });

  it("keeps a document under the target in one chunk", () => {
    const markdown = doc("# Titre", para("a", 30), para("b", 30));

    expect(chunkBySize(markdown, small)).toEqual([markdown]);
  });

  it("cuts only on paragraph boundaries: the chunks rejoin into the original paragraphs", () => {
    const blocks = Array.from({ length: 20 }, (_, i) => para(`p${String(i)}`, 30));

    const chunks = chunkBySize(doc(...blocks), small);

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.join("\n\n")).toBe(doc(...blocks));
  });

  it("cuts at the first paragraph boundary once the target is reached, never above the hard max", () => {
    const blocks = Array.from({ length: 20 }, (_, i) => para(`p${String(i)}`, 30));

    const chunks = chunkBySize(doc(...blocks), { targetChars: 100, maxChars: 300 });

    // 30 + 2 + 30 + 2 + 30 + 2 + 30 = 126: the fourth paragraph crosses the
    // target of 100, the fifth starts a new chunk.
    expect(chunks[0]).toBe(doc(...blocks.slice(0, 4)));
    expect(chunks.every((c) => c.length <= 300)).toBe(true);
  });

  it("never lets a chunk exceed the hard max, even below the target", () => {
    const chunks = chunkBySize(doc(para("a", 90), para("b", 70)), small);

    expect(chunks).toEqual([para("a", 90), para("b", 70)]);
  });

  it("prefers to cut before a heading once the chunk holds 70% of the target", () => {
    const markdown = doc(para("a", 70), "## Section suivante", para("b", 30), para("c", 30));

    expect(chunkBySize(markdown, small)[0]).toBe(para("a", 70));
  });

  it("does not cut before a heading while the chunk holds less than 70% of the target", () => {
    const markdown = doc(para("a", 69), "## Section suivante", para("b", 30));

    expect(chunkBySize(markdown, small)).toEqual([markdown]);
  });

  it.each(["# H1", "### H3", "###### H6"])("treats %j as a heading cut point", (heading) => {
    const markdown = doc(para("a", 70), heading, para("b", 30));

    expect(chunkBySize(markdown, small)[0]).toBe(para("a", 70));
  });

  it("does not treat a #hashtag or a 7-hash line as a heading", () => {
    expect(chunkBySize(doc(para("a", 70), "#motclé", para("b", 20)), small)).toHaveLength(1);
    expect(chunkBySize(doc(para("a", 70), "####### sept", para("b", 20)), small)).toHaveLength(1);
  });

  it("chunks a document with no heading at all", () => {
    const blocks = Array.from({ length: 10 }, (_, i) => para(`p${String(i)}`, 40));

    expect(chunkBySize(doc(...blocks), small).length).toBeGreaterThan(1);
  });

  it("moves a trailing heading to the next chunk when the hard max forces the cut", () => {
    const markdown = doc(para("a", 45), "## Suite", para("c", 80));

    // 45 + 2 + 8 = 55 then + 2 + 80 > 110: the cut falls after "## Suite".
    expect(chunkBySize(markdown, { targetChars: 200, maxChars: 110 })).toEqual([para("a", 45), doc("## Suite", para("c", 80))]);
  });

  describe("fenced code blocks", () => {
    const tight = { targetChars: 60, maxChars: 90 };
    // Three 30-character lines separated by blank lines: ~100 characters,
    // above the hard max, so a chunker splitting on every blank line would
    // cut it apart.
    const code = (open: string, close: string | null, parts = ["ligne un", "ligne deux", "ligne trois"]) =>
      [open, ...parts.map((part) => para(part, 30)).flatMap((line, i) => (i === 0 ? [line] : ["", line])), ...(close === null ? [] : [close])].join("\n");

    it("never cuts inside a ``` block, blank lines included: an oversized block stays whole, alone", () => {
      const block = code("```python", "```");

      expect(chunkBySize(doc(para("a", 70), block, para("b", 20)), tight)).toEqual([para("a", 70), block, para("b", 20)]);
    });

    it("never cuts inside a ~~~ block", () => {
      const block = code("~~~", "~~~");

      expect(chunkBySize(doc(para("a", 70), block), tight)).toEqual([para("a", 70), block]);
    });

    it("does not treat a heading-like line inside a code block as a cut point", () => {
      const block = ["```bash", "echo start", "", "# commentaire shell", "echo ok", "```"].join("\n");
      const markdown = doc(para("a", 60), block);

      expect(chunkBySize(markdown, small)).toEqual([markdown]);
    });

    it.each([
      ["a different character", "~~~~"],
      ["a shorter marker", "```"],
    ])("does not close a ```` fence on %s", (_why, inner) => {
      const block = ["````", inner, "", para("p1", 40), "", para("p2", 40), "", "````"].join("\n");

      expect(chunkBySize(doc(para("a", 70), block), tight)).toEqual([para("a", 70), block]);
    });

    it("treats an unclosed fence as running to the end of the document", () => {
      const block = code("```", null);

      expect(chunkBySize(doc(para("a", 70), block), tight)).toEqual([para("a", 70), block]);
    });

    it("starts a code block even without a blank line before its fence", () => {
      const block = code("```", "```");

      expect(chunkBySize(`${para("a", 70)}\n${block}`, tight)).toEqual([para("a", 70), block]);
    });
  });

  it("folds a tiny last chunk into the previous one when the hard max allows it", () => {
    const markdown = doc(para("a", 50), para("b", 50), para("c", 10));

    // Target reached after a + b (102): c would be a 10-char chunk alone.
    expect(chunkBySize(markdown, small)).toEqual([markdown]);
  });

  it("keeps the last chunk separate when it is at least a quarter of the target", () => {
    const markdown = doc(para("a", 50), para("b", 50), para("c", 25));

    expect(chunkBySize(markdown, { targetChars: 100, maxChars: 200 })).toEqual([doc(para("a", 50), para("b", 50)), para("c", 25)]);
  });

  it("keeps a tiny last chunk separate when folding it would exceed the hard max", () => {
    const markdown = doc(para("a", 70), para("b", 70), para("c", 10));

    expect(chunkBySize(markdown, small)).toEqual([doc(para("a", 70), para("b", 70)), para("c", 10)]);
  });

  it("defaults to a 10 000-character target and a 15 000-character hard max", () => {
    expect(DEFAULT_CHUNKING).toEqual({ targetChars: 10_000, maxChars: 15_000 });
    const blocks = Array.from({ length: 200 }, (_, i) => para(`p${String(i)}`, 400));

    const chunks = chunkBySize(doc(...blocks));

    expect(chunks.every((c) => c.length <= 15_000)).toBe(true);
    expect(chunks.slice(0, -1).every((c) => c.length >= 10_000)).toBe(true);
  });
});
