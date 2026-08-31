import type { LucideIcon } from "lucide-react";
import { APP_NAME } from "../app-info.js";
import { ICON_SIZE_NAV, ICON_STROKE_WIDTH } from "../lib/icons.js";
import { cn } from "../lib/utils.js";

export interface AppNavItem {
  key: string;
  label: string;
  // A component reference, never a string name (docs/UI.md's Icons note):
  // App.tsx passes the icon itself (e.g. `icon: Home`), so there is no
  // name-to-component lookup for this file to own.
  icon: LucideIcon;
  active: boolean;
  onClick: () => void;
}

// docs/UI.md's Layout/Navigation sections: one persistent nav, not two
// separately-authored trees for desktop and mobile — the same buttons
// reposition via responsive classes from a left sidebar (>=768px) to a
// bottom tab bar (<768px). Kept as a single element deliberately: two
// parallel <nav> trees would double every nav landmark and every button's
// accessible name, breaking getByRole("button", { name }) queries that
// assume one match.
//
// Not yet built: the secondary group (Mes notes, Réglages have no screen at
// all yet) and the tablet 72px icon-only collapse, which needs tooltips
// standing in for the hidden labels — a new interaction pattern this pass
// does not introduce (docs/UI.md's Icons note). The sidebar stays at its
// full desktop width through the tablet breakpoint instead of collapsing.
export function AppNav({ items, dimmed = false }: { items: AppNavItem[]; dimmed?: boolean }) {
  return (
    <nav
      aria-label="Navigation principale"
      className={cn(
        "fixed inset-x-0 bottom-0 z-10 flex border-t border-border bg-surface",
        // md:static (fixed's opposite) used to put the sidebar back into
        // normal flow on desktop, so a page taller than the viewport
        // scrolled it away with everything else — not just "permanent" in
        // the sense of always-rendered, actually pinned (docs/UI.md's
        // Desktop layout note). Fixed to the left edge, full viewport
        // height, exactly like the mobile bar is fixed to the bottom.
        "md:fixed md:inset-y-0 md:left-0 md:right-auto md:w-60 md:shrink-0 md:flex-col md:gap-1 md:border-t-0 md:border-r md:p-4",
        // Visual de-emphasis only during a review session (docs/UI.md's
        // Révision note): the nav stays fully clickable — "leaving must
        // never feel like a trap" rules out disabling it, so dimming is
        // opacity alone, nothing that blocks a click or keyboard activation.
        dimmed && "opacity-50",
      )}
    >
      <span className="hidden font-[var(--font-display)] text-lg font-extrabold md:mb-6 md:block">{APP_NAME}</span>
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <button
            key={item.key}
            type="button"
            aria-current={item.active ? "page" : undefined}
            onClick={item.onClick}
            className={cn(
              "flex min-h-11 flex-1 items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium md:flex-none md:justify-start md:gap-2 md:rounded-[var(--radius-button)] md:text-left",
              item.active ? "text-primary md:bg-primary-soft" : "text-text-muted hover:text-text md:hover:bg-canvas",
            )}
          >
            <Icon aria-hidden="true" focusable="false" size={ICON_SIZE_NAV} strokeWidth={ICON_STROKE_WIDTH} />
            {item.label}
          </button>
        );
      })}
    </nav>
  );
}
