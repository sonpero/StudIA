import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// M10 Phase 1's per-screen backlog (docs/MILESTONES.md), this screen's own
// pass, following the pattern TodayScreen.tsx's own pass established (this
// file's sibling, TodayScreen.responsive.unit.test.ts, carries the full
// reasoning). A media query's own breakpoint switch is invisible to jsdom's
// layout-free DOM, so the class-name-assertion exception (docs/UI.md's
// Responsive conventions) is reached for here — there is no other
// behaviour to assert on instead.
const source = readFileSync(new URL("./DocumentsScreen.tsx", import.meta.url), "utf-8");

describe("DocumentsScreen responsive structure (M10 Phase 1)", () => {
  it("the screen's own root carries the mobile/desktop padding scale (docs/UI.md: 16px below 768px, 32px at or above) — was a flat p-8 before, unconditional at every width", () => {
    expect(source).toMatch(/flex flex-col gap-\[var\(--space-section\)\] p-4 md:p-8/);
  });

  it("the two-column row stacks below 768px (the course list first, in source order) and only becomes a row from md up", () => {
    expect(source).toMatch(/flex flex-col gap-\[var\(--space-section\)\] md:flex-row/);
  });

  it("the upload panel is full width below 768px, and only a fixed 320px column from md — the exact shape docs/UI.md's own Responsive conventions bans (\"a fixed pixel width combined with shrink-0 and no responsive variant at all\") is gone", () => {
    expect(source).toMatch(/w-full md:w-\[320px\] md:shrink-0/);
  });
});
