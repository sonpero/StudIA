import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// M10 Phase 1's per-screen backlog (docs/MILESTONES.md), this screen's own
// pass, following the established idiom of this file's own siblings
// (NotionsScreen/ReaderScreen/ProgressScreen.responsive.unit.test.ts). A
// media query's own breakpoint switch is invisible to jsdom's layout-free
// DOM, so the class-name-assertion exception (docs/UI.md's Responsive
// conventions) is reached for the root padding and the grid-gap fix here.
// This screen has only three top-level states (loading, error, ready) —
// unlike Notions/Lecteur/Progrès, there is no distinct "empty" branch: an
// empty month is a normal, always-present grid with nothing in it, and
// "Prochaines échéances"' own empty sentence already covers that sub-case
// (docs/UI.md's Agenda note). The two-column split
// (`lg:grid-cols-[2fr_1fr]`) is untouched: docs/MILESTONES.md's own M10
// Phase 1 acceptance text names this screen (as "Calendrier") alongside
// Lecteur as one of the two already-sanctioned exceptions to the default
// 768px point, not a bug to fix.
const source = readFileSync(new URL("./CalendarScreen.tsx", import.meta.url), "utf-8");

function occurrences(needle: string): number {
  return source.split(needle).length - 1;
}

describe("CalendarScreen responsive structure (M10 Phase 1)", () => {
  it("the loading and ready states' own roots (identical <main>) carry the mobile/desktop padding scale (docs/UI.md: 16px below 768px, 32px at or above)", () => {
    expect(occurrences('<main className="flex flex-col gap-[var(--space-section)] p-4 md:p-8">')).toBe(2);
    expect(occurrences('<main className="flex flex-col gap-[var(--space-section)] p-8">')).toBe(0);
  });

  it("the error state's own root carries the same padding scale", () => {
    expect(source).toMatch(/flex flex-col items-center gap-\[var\(--space-section\)\] p-4 md:p-8 text-center/);
  });

  it("the two-column split still switches at lg (1024px), unchanged — a month grid is exactly the kind of content docs/UI.md's own Responsive conventions names as needing extra width before splitting", () => {
    expect(source).toContain("lg:grid-cols-[2fr_1fr]");
  });
});
