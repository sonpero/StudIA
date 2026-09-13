// M10 Phase 1's own reference pattern (docs/UI.md's Responsive conventions;
// first written for TodayScreen.tsx, extracted here once a second screen
// needed the exact same thing) for expanding a touch target to 44px without
// changing its visible box: a `relative` positioning context plus an
// absolutely centred `before` pseudo-element, fixed 44px square — the
// technique Button's own `link` variant already established
// (apps/web/src/components/ui/button.tsx), centred on both axes here since
// every target using this is small in both dimensions (`link`'s own variant
// only ever needed vertical centring, its box already full width).
//
// `before:-z-10` is load-bearing, not decoration: an absolutely-positioned
// pseudo-element with the default `z-index: auto` paints *after* — on top
// of — its host's own in-flow, non-positioned children (CSS2.1's stacking
// order). Without it, a target that wraps its real control in another
// element (a native `<input>` cannot host `::before` at all, a replaced
// element undefined by the CSS spec) would have its pseudo-element sit
// visually on top of the real control and intercept every pointer event
// over it, including directly over its own visible box — a real regression
// found this way (`e2e/todo-photo.spec.ts`'s own `.click()` on a checkbox
// using this pattern started timing out, Playwright reporting the
// wrapping element as "intercepting pointer events"). The negative z-index
// moves the pseudo behind the real, in-flow control instead: the control
// (unmoved, still un-positioned) keeps painting on top wherever the two
// overlap — its own real box — while the pseudo, being the only thing
// painted in the margin beyond that box, still catches a click there.
//
// `isolate` is just as load-bearing, for a subtler reason: `position:
// relative` alone does not create a stacking context, so a plain `-z-10`
// doesn't stay scoped to "behind this element's own content" — it escapes
// to the nearest actual stacking context, which can be several ancestors
// up (a second real regression found fixing the first: without `isolate`,
// a click in the margin started hitting a distant ancestor instead of the
// element itself). `isolate` (`isolation: isolate`) forces this element to
// start its own stacking context, so `-z-10` only ever competes against
// that element's own children — the real control or icon — never anything
// outside it.
export const EXPAND_TAP_TARGET_44 =
  "relative isolate before:absolute before:left-1/2 before:top-1/2 before:-z-10 before:h-11 before:w-11 before:-translate-x-1/2 before:-translate-y-1/2 before:content-['']";
