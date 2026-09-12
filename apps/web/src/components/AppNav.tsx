import { Flame, GraduationCap, type LucideIcon } from "lucide-react";
import { APP_NAME, APP_TAGLINE } from "../app-info.js";
import { ICON_SIZE_NAV, ICON_STROKE_WIDTH } from "../lib/icons.js";
import { cn } from "../lib/utils.js";

export interface AppNavItem {
  key: string;
  label: string;
  // Mobile-only visible text, hidden from assistive tech, at most 7
  // characters (M10 Phase 1, shell pass) — measured, not estimated: four
  // of the seven full labels didn't fit on one line inside a stacked
  // 53px-wide button at 375px, and a forced mid-word break ("Aujourd"/
  // "'hui") was confirmed illegible rather than assumed acceptable. `label`
  // stays the accessible name (via aria-label, below) and the desktop
  // visible text unconditionally — this is presentation data for the
  // mobile bar alone, never a rename of the destination itself.
  shortLabel: string;
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
//
// M10 Phase 1 (shell pass): below 768px, each destination stacks its icon
// above its label instead of beside it — side by side left only ~53px per
// destination at 375px once seven share the bar, and px-3 alone used to
// spend nearly half of that on padding. The visible mobile label is a
// short form (AppNavItem's own shortLabel, above) rather than the full
// name: measured, not assumed, that four of the seven didn't fit
// legibly on one line at that width, and a forced mid-word break was
// confirmed illegible too. The accessible name never changes either way
// (aria-label carries the full label always, on both breakpoints).
// min-h-11 stays on every destination once stacked — the 44px touch
// target is a deliberate exception to the spacing scale (docs/UI.md's
// Responsive conventions note), not something a layout change gets to
// quietly drop.
//
// The bar's own height (icon + label + padding, safe-area included) is
// one CSS custom property, --nav-bar-height-mobile (tokens.css),
// consumed here via h-* and by App.tsx's own content-column reserve via
// pb-* — not two independently guessed numbers a future change could
// desynchronise the way this bar's own pb-16 once could. The bar's own
// pb-[env(safe-area-inset-bottom)] keeps its buttons clear of iOS's
// gesture area while its background still reaches the true bottom edge.
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
        // h-[var(--nav-bar-height-mobile)] (tokens.css) is the one place
        // this bar's own mobile height is set; App.tsx's own content-area
        // reserve reads the same token rather than a second, independently
        // guessed number (the bug this replaced: a hand-picked pb-16 that
        // had no relationship to the bar's real height once it grew from a
        // single row to icon-over-label). pb-[env(safe-area-inset-bottom)]
        // pushes the button row itself above iOS's own gesture area while
        // the bar's own background still reaches the true bottom edge —
        // the token's own calc() already accounts for both together, so
        // the two numbers can't drift apart the way pb-16 and this bar's
        // real height once did.
        "fixed inset-x-0 bottom-0 z-10 flex h-[var(--nav-bar-height-mobile)] border-t border-border bg-surface pb-[env(safe-area-inset-bottom)]",
        // md:static (fixed's opposite) used to put the sidebar back into
        // normal flow on desktop, so a page taller than the viewport
        // scrolled it away with everything else — not just "permanent" in
        // the sense of always-rendered, actually pinned (docs/UI.md's
        // Desktop layout note). Fixed to the left edge, full viewport
        // height, exactly like the mobile bar is fixed to the bottom.
        // md:h-auto lets md:inset-y-0 imply the height again — an explicit
        // height (the mobile bar's own) would otherwise override the
        // inset-driven full-viewport height CSS would normally give it.
        "md:fixed md:inset-y-0 md:left-0 md:right-auto md:h-auto md:w-60 md:shrink-0 md:flex-col md:gap-1 md:border-t-0 md:border-r md:p-4",
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
            // Always the full label, on both breakpoints: aria-label wins
            // accessible-name computation over visible content regardless,
            // so no existing getByRole("button", { name: item.label })
            // query anywhere had to change when the mobile-visible text
            // became a short form.
            aria-label={item.label}
            onClick={item.onClick}
            className={cn(
              // min-w-0 lets the button shrink below its label's own
              // content width instead of forcing the whole bar wider than
              // the viewport (docs/UI.md's Responsive conventions note:
              // the recurring cause of horizontal overflow is exactly this
              // missing on a flex item carrying long text). break-words on
              // the label span below is the actual wrap; this only grants
              // the room for it to happen in.
              // leading-tight (mobile only): text-[length:var(--text-label)]
              // is an arbitrary value, so unlike md:text-sm below it carries
              // no paired line-height of its own (Tailwind's real text-sm
              // bundles both font-size and line-height as one utility) —
              // needs one stated explicitly, the same pairing this file's
              // own tagline already uses for the same token. md:text-sm
              // brings its own line-height back at that breakpoint, so no
              // md:leading-* override is needed or wanted there.
              "flex min-h-11 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-full px-1 py-1.5 text-center text-[length:var(--text-label)] font-medium leading-tight md:flex-row md:flex-none md:justify-start md:gap-2 md:px-3 md:py-2 md:text-left md:text-sm",
              item.active ? "text-primary md:bg-primary-soft md:font-semibold" : "text-text-muted hover:text-text md:hover:bg-canvas",
            )}
          >
            <Icon aria-hidden="true" focusable="false" size={ICON_SIZE_NAV} strokeWidth={ICON_STROKE_WIDTH} className="shrink-0" />
            {/* Both spans aria-hidden: aria-label above already carries
                the accessible name, so neither is ever announced, but
                marking them explicitly keeps that true even if aria-label
                were ever removed by accident later. w-full min-w-0
                (mobile only): without a width to actually respect, a flex
                child sizes to its own max-content width regardless of
                align-items:center on the parent — confirmed by
                measurement, not assumed (the full labels, before the
                short-form decision below, overlapped their neighbour's
                column instead of wrapping). md:w-auto restores desktop's
                original content-sized label once side by side with the
                icon again. */}
            <span aria-hidden="true" className="w-full min-w-0 break-words md:hidden">
              {item.shortLabel}
            </span>
            <span aria-hidden="true" className="hidden md:inline">
              {item.label}
            </span>
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
