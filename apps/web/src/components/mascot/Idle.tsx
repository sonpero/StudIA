// Fiche, idle pose: empty states, onboarding (docs/UI.md). Flat SVG, no
// raster assets. Decorative: aria-hidden, the state it illustrates is
// always also written in text next to it.
export function Idle() {
  return (
    <svg viewBox="0 0 120 120" width="96" height="96" aria-hidden="true" focusable="false">
      <rect x="20" y="10" width="80" height="100" rx="12" fill="var(--color-surface)" stroke="var(--color-border)" strokeWidth="2" />
      <circle cx="48" cy="55" r="4" fill="var(--color-text)" />
      <circle cx="72" cy="55" r="4" fill="var(--color-text)" />
      <path d="M48 80 Q60 88 72 80" stroke="var(--color-text)" strokeWidth="2.5" fill="none" strokeLinecap="round" />
      {/* arms relaxed at the sides */}
      <path d="M20 68 Q8 80 14 94" stroke="var(--color-text)" strokeWidth="3" fill="none" strokeLinecap="round" />
      <path d="M100 68 Q112 80 106 94" stroke="var(--color-text)" strokeWidth="3" fill="none" strokeLinecap="round" />
    </svg>
  );
}
