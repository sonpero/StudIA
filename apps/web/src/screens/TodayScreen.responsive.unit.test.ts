import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// M10 Phase 1's own reference pass for this screen (docs/MILESTONES.md).
// Two of its three structural changes have no behaviour jsdom can observe:
// a media query's own breakpoint switch is invisible to jsdom's layout-free
// DOM, the same reason TodayScreen.spacing.unit.test.ts (this file's own
// sibling) already source-scans instead of rendering. docs/UI.md's own
// Responsive conventions note names this the class-name-assertion
// exception, reached only where no real behaviour differs to assert on
// instead. The fourth structural change this pass makes (the touch-target
// pseudo-elements) has its own class-based checks in
// TodayScreen.unit.test.tsx instead, alongside the behaviour they attach
// to; nothing here duplicates those.
const source = readFileSync(new URL("./TodayScreen.tsx", import.meta.url), "utf-8");

describe("TodayScreen responsive structure (M10 Phase 1)", () => {
  it("the screen's own root now carries the mobile/desktop padding scale (docs/UI.md: 16px below 768px, 32px at or above) — this screen had none before, unlike every other screen's own unconditional p-8", () => {
    expect(source).toMatch(/flex flex-col gap-\[var\(--space-section\)\] p-4 md:p-8/);
  });

  it("the two-column row stacks below 768px (main column first, in source order) and only becomes a row from md up", () => {
    expect(source).toMatch(/flex flex-col gap-\[var\(--space-section\)\] md:flex-row/);
  });

  it("the sidebar (Pomodoro, Sons d'ambiance) is full width below 768px, and only a fixed 300px column from md — the exact shape docs/UI.md's own Responsive conventions bans (\"a fixed pixel width combined with shrink-0 and no responsive variant at all\") is gone", () => {
    expect(source).toMatch(/w-full flex-col gap-\[var\(--space-section\)\] md:w-\[300px\] md:shrink-0/);
  });
});
