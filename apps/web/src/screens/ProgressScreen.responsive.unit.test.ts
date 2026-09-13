import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// M10 Phase 1's per-screen backlog (docs/MILESTONES.md), this screen's own
// pass, following NotionsScreen/ReaderScreen.responsive.unit.test.ts's own
// established idiom (source scan, not a render: a media query's own
// breakpoint switch is invisible to jsdom's layout-free DOM, docs/UI.md's
// own class-name-assertion exception).
const source = readFileSync(new URL("./ProgressScreen.tsx", import.meta.url), "utf-8");

function occurrences(needle: string): number {
  return source.split(needle).length - 1;
}

describe("ProgressScreen responsive structure (M10 Phase 1)", () => {
  it("the loading, empty and ready states' own roots (identical <main>) carry the mobile/desktop padding scale (docs/UI.md: 16px below 768px, 32px at or above)", () => {
    expect(occurrences('<main className="flex flex-col gap-[var(--space-section)] p-4 md:p-8">')).toBe(3);
    expect(occurrences('<main className="flex flex-col gap-[var(--space-section)] p-8">')).toBe(0);
  });

  it("the error state's own root carries the same padding scale", () => {
    expect(source).toMatch(/flex flex-col items-center gap-\[var\(--space-section\)\] p-4 md:p-8 text-center/);
  });

  // docs/MILESTONES.md's own M10 Phase 1 acceptance text names this
  // explicitly: "768px is the default point to become a row... a later
  // breakpoint is allowed when the screen's own note states why (Calendrier,
  // Lecteur), an earlier one never is (Progression's own pre-existing 640px
  // split is the thing actually wrong)". This screen's own two-column
  // splits (the detail card's header/ring/lower rows, the ring spacer, the
  // stat-tile grid, and the "Tous les cours" row) all switched at `sm`
  // (640px, too early) instead of `md` (768px) — this pass's own fix,
  // not a new redesign: bringing an already-flagged violation of this
  // milestone's own written convention into compliance. Invisible at the
  // desktop test viewport (well above both values), so "desktop unchanged"
  // is not at risk — the only visible difference is in the previously
  // undocumented 640-768px gap.
  it("every two-column split on this screen switches at md (768px), not the pre-existing, too-early sm (640px)", () => {
    expect(occurrences("sm:")).toBe(0);
    expect(source).toContain('className="hidden shrink-0 md:block md:w-[140px]"');
    expect(occurrences('className="flex flex-col gap-[var(--space-section)] md:flex-row md:items-start"')).toBe(2);
    expect(source).toContain('className="flex flex-col items-center gap-[var(--space-section)] md:flex-row md:items-center"');
    expect(source).toContain('className="grid grid-cols-2 gap-2 md:grid-cols-4"');
    expect(source).toContain("md:flex-row md:items-center md:gap-[var(--space-related)]");
    expect(source).toContain('className="flex items-center gap-[var(--space-related)] md:w-56 md:shrink-0"');
  });
});
