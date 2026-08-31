// Fiche, sleeping pose: nothing due today (docs/UI.md). Flat SVG, no raster
// assets. Decorative: aria-hidden, the state it illustrates is always also
// written in text next to it.
export function Sleeping() {
  return (
    <svg viewBox="0 0 120 120" width="96" height="96" aria-hidden="true" focusable="false" data-testid="mascot">
      <rect x="20" y="10" width="80" height="100" rx="12" fill="var(--color-surface)" stroke="var(--color-border)" strokeWidth="2" />
      {/* closed, curved eyes */}
      <path d="M42 55 Q48 51 54 55" stroke="var(--color-text)" strokeWidth="2.5" fill="none" strokeLinecap="round" />
      <path d="M66 55 Q72 51 78 55" stroke="var(--color-text)" strokeWidth="2.5" fill="none" strokeLinecap="round" />
      <path d="M52 80 Q60 78 68 80" stroke="var(--color-text)" strokeWidth="2.5" fill="none" strokeLinecap="round" />
      {/* little zzz */}
      <text x="88" y="34" fontSize="16" fill="var(--color-text-muted)" fontFamily="var(--font-display)">
        z
      </text>
      <text x="96" y="24" fontSize="12" fill="var(--color-text-muted)" fontFamily="var(--font-display)">
        z
      </text>
      <path d="M20 70 Q8 80 14 92" stroke="var(--color-text)" strokeWidth="3" fill="none" strokeLinecap="round" />
      <path d="M100 70 Q112 80 106 92" stroke="var(--color-text)" strokeWidth="3" fill="none" strokeLinecap="round" />
    </svg>
  );
}
