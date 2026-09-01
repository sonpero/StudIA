import { globSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { compile } from "tailwindcss";
import { describe, expect, it } from "vitest";

// Tailwind's arbitrary-value syntax is ambiguous for both of these prefixes:
// text-[value] could mean colour, font-size, or line-height; font-[value]
// could mean font-family, font-weight, or font-style. Without a type hint
// (text-[length:...], font-[family-name:...]), Tailwind guesses — and here
// it guessed wrong for every single call site: text-[var(--text-*)] compiled
// to `color`, font-[var(--font-display)] compiled to `font-weight`. Every
// existing test only ever asserted the class-name string was present, never
// what it actually compiled to, so this survived the entire Type pass
// undetected — the same failure shape as the colour-collision threshold that
// passed its own test while failing on screen.
const srcDir = fileURLToPath(new URL("../..", import.meta.url));

function tsxFiles(): string[] {
  return globSync("**/*.tsx", { cwd: srcDir })
    .filter((f) => !f.includes(".test."))
    .map((f) => path.join(srcDir, f));
}

function findMatches(pattern: RegExp): Set<string> {
  const found = new Set<string>();
  for (const file of tsxFiles()) {
    const content = readFileSync(file, "utf-8");
    for (const m of content.matchAll(pattern)) found.add(m[0]);
  }
  return found;
}

const AMBIGUOUS_NO_HINT = /\b(?:text|font)-\[var\(--[\w-]+\)\]/g;
const HINTED_TEXT_SIZE = /text-\[length:var\(--text-[\w-]+\)\]/g;
const HINTED_FONT_FAMILY = /font-\[family-name:var\(--font-[\w-]+\)\]/g;

// No @theme needed: arbitrary values carrying a literal var(...) compile
// the same regardless of whether that custom property is ever declared —
// confirmed empirically before writing this file, not assumed.
async function compiledPropertyBlock(className: string): Promise<string> {
  const result = await compile("@tailwind utilities;", { base: srcDir });
  return result.build([className]);
}

describe("Tailwind arbitrary-value type hints", () => {
  it("no text-[var(--...)] or font-[var(--...)] appears anywhere in apps/web/src without a type hint — the ambiguous form that silently compiled to the wrong property", () => {
    const offenders = [...findMatches(AMBIGUOUS_NO_HINT)];
    expect(offenders).toEqual([]);
  });

  it("every text-[length:var(--text-*)] class actually in use compiles to font-size, not colour", async () => {
    const classes = [...findMatches(HINTED_TEXT_SIZE)];
    expect(classes.length).toBeGreaterThan(0); // the extraction itself must find real call sites, not silently match nothing
    for (const cls of classes) {
      const css = await compiledPropertyBlock(cls);
      expect(css).toContain("font-size:");
      expect(css).not.toContain("color:");
    }
  });

  it("every font-[family-name:var(--font-*)] class actually in use compiles to font-family, not font-weight", async () => {
    const classes = [...findMatches(HINTED_FONT_FAMILY)];
    expect(classes.length).toBeGreaterThan(0);
    for (const cls of classes) {
      const css = await compiledPropertyBlock(cls);
      expect(css).toContain("font-family:");
      expect(css).not.toContain("font-weight:");
    }
  });
});
