// Fiche, reading pose: extraction in progress (docs/UI.md). Flat SVG, no
// raster assets. Decorative: aria-hidden, the state it illustrates is
// always also written in text next to it.
export function Reading() {
  return (
    <svg viewBox="0 0 120 120" width="96" height="96" aria-hidden="true" focusable="false">
      <rect x="20" y="10" width="80" height="100" rx="12" fill="var(--color-surface)" stroke="var(--color-border)" strokeWidth="2" />
      <circle cx="48" cy="55" r="4" fill="var(--color-text)" />
      <circle cx="72" cy="55" r="4" fill="var(--color-text)" />
      <path d="M50 75 Q60 70 70 75" stroke="var(--color-text)" strokeWidth="2.5" fill="none" strokeLinecap="round" />
      {/* a little book Fiche is reading */}
      <rect x="42" y="88" width="36" height="14" rx="2" fill="var(--color-primary-soft)" stroke="var(--color-primary)" strokeWidth="1.5" />
      <line x1="60" y1="88" x2="60" y2="102" stroke="var(--color-primary)" strokeWidth="1.5" />
      {/* arms */}
      <path d="M20 70 Q5 78 12 92" stroke="var(--color-text)" strokeWidth="3" fill="none" strokeLinecap="round" />
      <path d="M100 70 Q115 78 108 92" stroke="var(--color-text)" strokeWidth="3" fill="none" strokeLinecap="round" />
    </svg>
  );
}
