import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// M10 Phase 1's per-screen backlog (docs/MILESTONES.md), this screen's own
// pass. A media query's own breakpoint switch is invisible to jsdom's
// layout-free DOM, so the class-name-assertion exception (docs/UI.md's
// Responsive conventions) is reached for the root padding here — there is
// no other behaviour to assert on instead. This screen has no fixed-width
// column to fix (unlike Aujourd'hui/Mes cours): its own layout is a single
// column throughout, so there is nothing else structural for this file to
// check — the touch-target fixes (CoursePill, the notion-type checkboxes)
// are checked as rendered-element className assertions in
// NotionsScreen.unit.test.tsx instead, alongside the behaviour they attach
// to, following that file's own established idiom.
//
// Four separate top-level returns (loading/error/empty/ready), each its own
// <main>, unlike Aujourd'hui/Mes cours' single conditional tree — counting
// occurrences of each exact className, rather than reconstructing each
// return's own surrounding markup, stays correct regardless of how the
// unrelated content around any one of them is later edited.
const source = readFileSync(new URL("./NotionsScreen.tsx", import.meta.url), "utf-8");

function occurrences(needle: string): number {
  return source.split(needle).length - 1;
}

describe("NotionsScreen responsive structure (M10 Phase 1)", () => {
  it("the loading and ready states' own roots (both a bare <main>) carry the mobile/desktop padding scale (docs/UI.md: 16px below 768px, 32px at or above)", () => {
    expect(occurrences('<main className="p-4 md:p-8">')).toBe(2);
    expect(occurrences('<main className="p-8">')).toBe(0);
  });

  it("the error state's own root carries the same padding scale", () => {
    expect(source).toMatch(/flex flex-col items-center gap-\[var\(--space-section\)\] p-4 md:p-8 text-center/);
  });

  it("the empty state's own root carries the same padding scale", () => {
    expect(source).toMatch(/flex flex-col items-center gap-4 p-4 md:p-8 text-center/);
  });
});
