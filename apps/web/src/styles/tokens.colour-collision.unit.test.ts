import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Kept in sync by hand with packages/core/src/ingestion/domain/colour.ts's
// SUBJECT_COLOUR_PALETTE: apps/web never imports @studia/core (it only
// ever talks to the API, never the domain layer directly), so this is a
// literal copy, not an import. Anyone editing that palette must update
// this array too, or this test silently stops protecting the real one.
const SUBJECT_COLOUR_PALETTE = ["#F75757", "#F36016", "#109DA0", "#0897D6", "#8B5CF6", "#EC4899"];

// docs/UI.md's Colour note: originally an accent-vs-subject-palette-only
// rule, widened once --accent's own move to green surfaced a collision
// with --success (a semantic token, not a subject colour) that the
// narrower rule couldn't see. The real invariant: no two colours this app
// hands a fixed meaning to — the semantic tokens below, and every
// subject-palette hue — read as the same colour.
const SEMANTIC_TOKEN_NAMES = ["--color-primary", "--color-accent", "--color-success", "--color-warning"];

// The ~4° gap between the old accent and the subject red was a real,
// visible collision, confirmed on screen; 16.6°+ was not. 15° sits
// between the two, closer to the confirmed-collision end.
const MIN_HUE_DISTANCE_DEG = 15;

// A subject colour is a card's own left border on --surface (#FFFFFF) —
// docs/UI.md's Subject colours note. Recomputing every value here (not
// trusting the last pass's own count) found four of six failing this,
// not the three previously written down; visible on screen as Anglais's
// own card border reading paler than its neighbours.
const MIN_SUBJECT_CONTRAST = 3;

function hexToHue(hex: string): number {
  const c = hex.replace("#", "");
  const r = parseInt(c.slice(0, 2), 16) / 255;
  const g = parseInt(c.slice(2, 4), 16) / 255;
  const b = parseInt(c.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max === min) return 0;
  const d = max - min;
  let h: number;
  switch (max) {
    case r:
      h = (g - b) / d + (g < b ? 6 : 0);
      break;
    case g:
      h = (b - r) / d + 2;
      break;
    default:
      h = (r - g) / d + 4;
  }
  return h * 60;
}

function hueDistance(a: number, b: number): number {
  const d = Math.abs(a - b);
  return d > 180 ? 360 - d : d;
}

function relativeLuminance(hex: string): number {
  const c = hex.replace("#", "");
  const channel = (v: number) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
  const r = channel(parseInt(c.slice(0, 2), 16) / 255);
  const g = channel(parseInt(c.slice(2, 4), 16) / 255);
  const b = channel(parseInt(c.slice(4, 6), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

function readSemanticTokens(): Record<string, string> {
  const tokensCss = readFileSync(new URL("./tokens.css", import.meta.url), "utf-8");
  const tokens: Record<string, string> = {};
  for (const name of SEMANTIC_TOKEN_NAMES) {
    const match = new RegExp(`${name}:\\s*(#[0-9a-fA-F]{6})`).exec(tokensCss);
    if (!match) throw new Error(`${name} not found in tokens.css`);
    tokens[name] = match[1]!;
  }
  return tokens;
}

describe("semantic colour tokens vs each other, and vs the subject palette", () => {
  it(`no two colours this app hands a fixed meaning to fall within ${MIN_HUE_DISTANCE_DEG}° of each other's hue (docs/UI.md's Colour note)`, () => {
    const semantic = readSemanticTokens();
    const semanticEntries = Object.entries(semantic);

    for (let i = 0; i < semanticEntries.length; i++) {
      for (let j = i + 1; j < semanticEntries.length; j++) {
        const [nameA, hexA] = semanticEntries[i]!;
        const [nameB, hexB] = semanticEntries[j]!;
        const distance = hueDistance(hexToHue(hexA), hexToHue(hexB));
        expect(distance, `${nameA} (${hexA}) is only ${distance.toFixed(1)}° from ${nameB} (${hexB})`).toBeGreaterThanOrEqual(MIN_HUE_DISTANCE_DEG);
      }
    }

    for (const [name, hex] of semanticEntries) {
      for (const subjectHex of SUBJECT_COLOUR_PALETTE) {
        const distance = hueDistance(hexToHue(hex), hexToHue(subjectHex));
        expect(distance, `${name} (${hex}) is only ${distance.toFixed(1)}° from subject colour ${subjectHex}`).toBeGreaterThanOrEqual(MIN_HUE_DISTANCE_DEG);
      }
    }
  });

  it(`every subject-palette colour reaches ${MIN_SUBJECT_CONTRAST}:1 contrast against --surface (#FFFFFF), a card's own left border still has to be visible (docs/UI.md's Subject colours note)`, () => {
    for (const subjectHex of SUBJECT_COLOUR_PALETTE) {
      const ratio = contrastRatio(subjectHex, "#FFFFFF");
      expect(ratio, `${subjectHex} only reaches ${ratio.toFixed(2)}:1 against #FFFFFF`).toBeGreaterThanOrEqual(MIN_SUBJECT_CONTRAST);
    }
  });
});
