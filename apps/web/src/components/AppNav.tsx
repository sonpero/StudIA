import { Flame, GraduationCap, type LucideIcon } from "lucide-react";
import { APP_NAME, APP_TAGLINE } from "../app-info.js";
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

// Two letters, from the pieces of a display name — "Léa Martin" -> "LM" —
// or the first two characters of a plain single-word username ("alex" ->
// "AL") when there's no second word to take one from.
function initials(username: string): string {
  const words = username.trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) return `${words[0]!.charAt(0)}${words[1]!.charAt(0)}`.toUpperCase();
  return username.slice(0, 2).toUpperCase();
}

// docs/UI.md's Layout/Navigation sections: one persistent nav, not two
// separately-authored trees for desktop and mobile — the same buttons
// reposition via responsive classes from a left sidebar (>=768px) to a
// bottom tab bar (<768px). Kept as a single element deliberately: two
// parallel <nav> trees would double every nav landmark and every button's
// accessible name, breaking getByRole("button", { name }) queries that
// assume one match.
//
// Adopts the redesigned Aujourd'hui screen's own sidebar
// (apps/web/src/screens/TodayScreen.tsx) as the app's real one: the
// tagline, the streak card and the user chip are new here, desktop-only
// (hidden md:flex — a bottom tab bar has no room for either).
// streak/dueCount/username are real data (App.tsx's own GET /api/today and
// useAuth), not mock.
//
// Not yet built: the secondary group (Mes notes, Réglages have no screen at
// all yet) and the tablet 72px icon-only collapse, which needs tooltips
// standing in for the hidden labels — a new interaction pattern this pass
// does not introduce (docs/UI.md's Icons note). The sidebar stays at its
// full desktop width through the tablet breakpoint instead of collapsing.
export function AppNav({
  items,
  dimmed = false,
  streak,
  dueCount,
  username,
}: {
  items: AppNavItem[];
  dimmed?: boolean;
  streak: number;
  dueCount: number;
  username: string;
}) {
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
      <div className="hidden items-center gap-2 px-2 md:mb-6 md:flex">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-button)] bg-primary">
          <GraduationCap aria-hidden="true" focusable="false" size={20} strokeWidth={ICON_STROKE_WIDTH} color="#fff" />
        </span>
        <span className="flex flex-col">
          <span className="font-[family-name:var(--font-display)] text-base font-extrabold leading-tight">{APP_NAME}</span>
          <span className="text-[length:var(--text-label)] leading-tight text-text-muted">{APP_TAGLINE}</span>
        </span>
      </div>
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <button
            key={item.key}
            type="button"
            aria-current={item.active ? "page" : undefined}
            onClick={item.onClick}
            className={cn(
              "flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-full px-3 py-2 text-sm font-medium md:flex-none md:justify-start md:gap-2 md:text-left",
              item.active ? "text-primary md:bg-primary-soft md:font-semibold" : "text-text-muted hover:text-text md:hover:bg-canvas",
            )}
          >
            <Icon aria-hidden="true" focusable="false" size={ICON_SIZE_NAV} strokeWidth={ICON_STROKE_WIDTH} />
            {item.label}
          </button>
        );
      })}

      <div className="hidden flex-1 md:block" />

      <div className="hidden flex-col gap-[var(--space-section)] md:flex">
        <div className="flex items-center gap-[var(--space-related)] rounded-[var(--radius-card)] border border-border bg-surface p-3 shadow-[0_1px_2px_rgba(16,24,40,.05)]">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-warning/10">
            <Flame aria-hidden="true" focusable="false" size={16} strokeWidth={ICON_STROKE_WIDTH} color="#f5b940" />
          </span>
          <div className="flex flex-col">
            <span className="text-sm font-bold">Série de {streak} jour{streak > 1 ? "s" : ""}</span>
            <span className="text-[length:var(--text-label)] text-text-muted">{streak > 0 ? "Continue comme ça !" : "Révise aujourd'hui pour commencer une série."}</span>
          </div>
        </div>

        <div className="flex items-center gap-[var(--space-related)] px-1">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-white">{initials(username)}</span>
          <div className="flex flex-col">
            <span className="text-sm font-semibold leading-tight">{username}</span>
            <span className="text-[length:var(--text-label)] leading-tight text-text-muted">
              {dueCount} fiche{dueCount > 1 ? "s" : ""} à réviser
            </span>
          </div>
        </div>
      </div>
    </nav>
  );
}
