import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Kept in sync by hand with packages/core/src/ingestion/domain/colour.ts's
// SUBJECT_COLOUR_PALETTE: apps/web never imports @studia/core (it only
// ever talks to the API, never the domain layer directly), so this is a
// literal copy, not an import. Anyone editing that palette must update
// this array too, or this test silently stops protecting the real one.
const SUBJECT_COLOUR_PALETTE = ["#F87171", "#F5B940", "#12B2B5", "#38BDF8", "#8B5CF6", "#EC4899"];

// docs/UI.md's Colour note: the ~4° gap between the old accent (#F04438)
// and the subject red (#F87171) was a real, visible collision, confirmed
// on screen before this pass. 15° is the floor this test enforces between
// the accent and every subject-palette hue.
const MIN_HUE_DISTANCE_DEG = 15;

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

describe("--accent vs the subject colour palette", () => {
  it("never falls within 15° of any subject-palette hue (docs/UI.md's Colour note)", () => {
    const tokensCss = readFileSync(new URL("./tokens.css", import.meta.url), "utf-8");
    const match = /--color-accent:\s*(#[0-9a-fA-F]{6})/.exec(tokensCss);
    if (!match) throw new Error("--color-accent not found in tokens.css");
    const accentHue = hexToHue(match[1]!);

    for (const subjectHex of SUBJECT_COLOUR_PALETTE) {
      const distance = hueDistance(accentHue, hexToHue(subjectHex));
      expect(distance, `${subjectHex} is only ${distance.toFixed(1)}° from the accent`).toBeGreaterThanOrEqual(MIN_HUE_DISTANCE_DEG);
    }
  });
});
