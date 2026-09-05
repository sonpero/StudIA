// Fiche, thinking pose: the tutor is answering (docs/UI.md). Flat SVG, no
// raster assets. Decorative: aria-hidden, the state it illustrates is
// always also written in text next to it.
//
// The one pose that shows the card's own back, not a face: "the mascot
// flips when it thinks and shows its back when it has an answer" (docs/UI.md's
// mascot introduction) — the metaphor this pose exists to pay off, not a
// fifth face design.
export function Thinking() {
  return (
    <svg viewBox="0 0 120 120" width="96" height="96" aria-hidden="true" focusable="false" data-testid="mascot">
      <rect x="20" y="10" width="80" height="100" rx="12" fill="var(--color-surface)" stroke="var(--color-border)" strokeWidth="2" />
      {/* a plain inner frame, standing in for the blank back of a card */}
      <rect x="32" y="24" width="56" height="72" rx="8" fill="none" stroke="var(--color-border)" strokeWidth="2" />
      {/* three dots: thinking, no face to read while the card is turned around */}
      <circle cx="48" cy="60" r="4" fill="var(--color-text-muted)" />
      <circle cx="60" cy="60" r="4" fill="var(--color-text-muted)" />
      <circle cx="72" cy="60" r="4" fill="var(--color-text-muted)" />
      {/* arms, relaxed */}
      <path d="M20 70 Q5 78 12 92" stroke="var(--color-text)" strokeWidth="3" fill="none" strokeLinecap="round" />
      <path d="M100 70 Q115 78 108 92" stroke="var(--color-text)" strokeWidth="3" fill="none" strokeLinecap="round" />
    </svg>
  );
}
