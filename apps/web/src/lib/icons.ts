// docs/UI.md's Icons note: size and stroke as tokens, not per-call numbers.
// Lucide takes size/strokeWidth as component props, not CSS properties, so a
// constant module — not a tokens.css custom property — is the token form
// here; every call site imports these instead of writing its own number.
export const ICON_SIZE_INLINE = 16; // beside a button/card-action label
export const ICON_SIZE_NAV = 20; // sidebar/tab-bar destination icons
export const ICON_STROKE_WIDTH = 2; // lucide's own default, named explicitly
