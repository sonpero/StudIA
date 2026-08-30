import { APP_NAME } from "../app-info.js";
import { cn } from "../lib/utils.js";

export interface AppNavItem {
  key: string;
  label: string;
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
// Not yet built: icons (docs/UI.md's "icon-plus-label" and the tablet
// icon-only collapse to 72px both depend on an icon set this app doesn't
// have — adding one needs its own justified dependency, out of scope for a
// visual-only pass) and the secondary group (Mes notes, Réglages have no
// screen at all yet). The sidebar stays at its full desktop width through
// the tablet breakpoint instead of collapsing.
export function AppNav({ items, dimmed = false }: { items: AppNavItem[]; dimmed?: boolean }) {
  return (
    <nav
      aria-label="Navigation principale"
      className={cn(
        "fixed inset-x-0 bottom-0 z-10 flex border-t border-border bg-surface",
        "md:static md:inset-auto md:w-60 md:shrink-0 md:flex-col md:gap-1 md:border-t-0 md:border-r md:p-4",
        // Visual de-emphasis only during a review session (docs/UI.md's
        // Révision note): the nav stays fully clickable — "leaving must
        // never feel like a trap" rules out disabling it, so dimming is
        // opacity alone, nothing that blocks a click or keyboard activation.
        dimmed && "opacity-50",
      )}
    >
      <span className="hidden font-[var(--font-display)] text-lg font-extrabold md:mb-6 md:block">{APP_NAME}</span>
      {items.map((item) => (
        <button
          key={item.key}
          type="button"
          aria-current={item.active ? "page" : undefined}
          onClick={item.onClick}
          className={cn(
            "min-h-11 flex-1 px-3 py-2 text-sm font-medium md:flex-none md:rounded-[var(--radius-button)] md:text-left",
            item.active ? "text-primary md:bg-primary-soft" : "text-text-muted hover:text-text md:hover:bg-canvas",
          )}
        >
          {item.label}
        </button>
      ))}
    </nav>
  );
}
