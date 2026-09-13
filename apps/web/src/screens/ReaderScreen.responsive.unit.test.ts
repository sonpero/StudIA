import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// M10 Phase 1's per-screen backlog (docs/MILESTONES.md), this screen's own
// pass, following NotionsScreen.responsive.unit.test.ts's own established
// idiom (that file's own comment has the full reasoning for why a source
// scan, not a render, is used here). This screen's own two-column layout
// (the reading card + "Étudier ce cours" panel, `lg:flex-row`/`lg:w-72`)
// already stacks correctly below its own `lg` breakpoint — a deliberate,
// already-documented exception to the default 768px point (docs/UI.md's
// Responsive conventions: "a screen whose content genuinely needs the
// extra width before splitting... may switch later instead — 1024px, say
// — provided its own Screen note states why"), confirmed by a real 375px
// measurement (scrollWidth already 375 before this pass touched anything)
// — so there is nothing to fix or test there. Only root padding is new.
const source = readFileSync(new URL("./ReaderScreen.tsx", import.meta.url), "utf-8");

function occurrences(needle: string): number {
  return source.split(needle).length - 1;
}

describe("ReaderScreen responsive structure (M10 Phase 1)", () => {
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
