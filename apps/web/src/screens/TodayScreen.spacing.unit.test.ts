import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// docs/UI.md's Shape and depth note: the sanctioned spacing scale is three
// named steps (--space-related 8px, --space-block 16px, --space-section
// 24px) plus four unnamed-but-available values (4, 12, 32, 48px) kept for a
// genuinely finer or coarser need. The testable invariant is not "a class is
// present" (docs/UI.md's own class-name-assertion exception already covers
// grid structure elsewhere in TodayScreen.unit.test.tsx) but the absence of
// any spacing value outside this set, however it is spelled — a bare
// Tailwind step or an arbitrary value.
const ALLOWED_PX = new Set([0, 4, 8, 12, 16, 24, 32, 48]);

// Tailwind's default scale is step*4px (gap-3 = 12px, gap-6 = 24px, ...) —
// the same arithmetic docs/UI.md's own table relies on.
const TAILWIND_STEP_PX = 4;

const SPACING_PREFIXES = ["gap-x", "gap-y", "gap", "space-x", "space-y", "px", "py", "pt", "pr", "pb", "pl", "p", "mx", "my", "mt", "mr", "mb", "ml", "m"];

const NAMED_TOKEN_ARBITRARY = /^\[var\(--space-(?:related|block|section)\)\]$/;

// Matches one whole Tailwind class token, never a substring: without the
// alternation being tried longest-effective-match first via anchoring, a
// naive scan could mistake "min-h-48"'s "-h-48" for a margin, or "pr-8" for
// a plain "p-8" — anchoring the whole token (^...$) and requiring a "-"
// straight after the prefix rules both out.
function buildTokenPattern(): RegExp {
  const prefixAlternation = SPACING_PREFIXES.join("|");
  return new RegExp(`^(?:${prefixAlternation})-(\\d+|\\[[^\\]]*\\])$`);
}

const TOKEN_PATTERN = buildTokenPattern();

function findOffScaleSpacingTokens(source: string): string[] {
  // Every double-quoted AND backtick-delimited string literal in the file —
  // className="...", className={`...`} (this file uses both), the string
  // args passed to cn(...), and the FIELD_CLASS/SELECT_CHEVRON constants
  // alike. A missed backtick literal is exactly how a first version of this
  // test let pr-9 (see the FIELD_CLASS-extending `<select>` below) through
  // uncaught: it lives in a template literal, not a plain string. Non-
  // className strings (copy text, the data-URI chevron, a template's own
  // `${...}` interpolation) never happen to contain a token matching
  // TOKEN_PATTERN, so scanning all of them is harmless.
  const stringLiterals = [...source.matchAll(/"([^"]*)"|`([^`]*)`/g)].map((m) => m[1] ?? m[2] ?? "");
  const offenders: string[] = [];

  for (const literal of stringLiterals) {
    for (const token of literal.split(/\s+/)) {
      const match = TOKEN_PATTERN.exec(token);
      if (!match) continue;
      const suffix = match[1] ?? "";
      if (suffix.startsWith("[")) {
        if (!NAMED_TOKEN_ARBITRARY.test(suffix)) offenders.push(token);
        continue;
      }
      const px = Number(suffix) * TAILWIND_STEP_PX;
      if (!ALLOWED_PX.has(px)) offenders.push(token);
    }
  }
  return offenders;
}

describe("TodayScreen spacing scale", () => {
  it("uses no spacing utility outside docs/UI.md's sanctioned scale (4, 8, 12, 16, 24, 32, 48px, or a named --space-* token)", () => {
    const source = readFileSync(new URL("./TodayScreen.tsx", import.meta.url), "utf-8");
    expect(findOffScaleSpacingTokens(source)).toEqual([]);
  });
});
