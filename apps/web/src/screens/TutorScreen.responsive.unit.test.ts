import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// M10 Phase 1's per-screen backlog (docs/MILESTONES.md), this screen's own
// pass — the last of the seven, following the established idiom of this
// file's own siblings (NotionsScreen/ReaderScreen/ProgressScreen/
// CalendarScreen.responsive.unit.test.ts). A media query's own breakpoint
// switch is invisible to jsdom's layout-free DOM, so the class-name-
// assertion exception (docs/UI.md's Responsive conventions) is reached for
// the root padding here. This screen has no fixed-width column and no
// two-column split at all — a single column throughout (the pill row,
// then the conversation) — so there is nothing else structural to check;
// the touch-target fix (CoursePill) is checked as a rendered-element
// className assertion in TutorScreen.unit.test.tsx instead, alongside the
// behaviour it attaches to, following that file's own established idiom.
const source = readFileSync(new URL("./TutorScreen.tsx", import.meta.url), "utf-8");

function occurrences(needle: string): number {
  return source.split(needle).length - 1;
}

describe("TutorScreen responsive structure (M10 Phase 1)", () => {
  it("the loading state's own root carries the mobile/desktop padding scale (docs/UI.md: 16px below 768px, 32px at or above)", () => {
    expect(occurrences('<main className="p-4 md:p-8">')).toBe(1);
    expect(occurrences('<main className="p-8">')).toBe(0);
  });

  it("the error state's own root carries the same padding scale", () => {
    expect(source).toMatch(/flex flex-col items-center gap-\[var\(--space-section\)\] p-4 md:p-8 text-center/);
  });

  it("the empty state's own root carries the same padding scale", () => {
    expect(source).toMatch(/flex flex-col items-center gap-4 p-4 md:p-8 text-center/);
  });

  it("the ready state's own root carries the same padding scale", () => {
    expect(source).toContain('<main className="flex flex-col p-4 md:p-8">');
  });
});
