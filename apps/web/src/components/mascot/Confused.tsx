// Fiche, confused pose: error states (docs/UI.md). Flat SVG, no raster
// assets. Decorative: aria-hidden, the state it illustrates is always also
// written in text next to it.
export function Confused() {
  return (
    <svg viewBox="0 0 120 120" width="96" height="96" aria-hidden="true" focusable="false" data-testid="mascot">
      <rect x="20" y="10" width="80" height="100" rx="12" fill="var(--color-surface)" stroke="var(--color-border)" strokeWidth="2" />
      {/* one eye squinted, one raised — puzzled look */}
      <line x1="43" y1="55" x2="53" y2="55" stroke="var(--color-text)" strokeWidth="3" strokeLinecap="round" />
      <circle cx="72" cy="53" r="4" fill="var(--color-text)" />
      <path d="M50 82 Q60 76 70 82" stroke="var(--color-text)" strokeWidth="2.5" fill="none" strokeLinecap="round" />
      {/* a small question mark floating above */}
      <text x="60" y="35" textAnchor="middle" fontSize="18" fill="var(--color-text-muted)" fontFamily="var(--font-display)">
        ?
      </text>
      {/* arms, one raised in a shrug */}
      <path d="M20 70 Q5 78 12 92" stroke="var(--color-text)" strokeWidth="3" fill="none" strokeLinecap="round" />
      <path d="M100 70 Q112 58 104 50" stroke="var(--color-text)" strokeWidth="3" fill="none" strokeLinecap="round" />
    </svg>
  );
}
