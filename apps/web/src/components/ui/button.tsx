import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex min-h-11 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-[var(--radius-button)] px-4 py-2 text-sm font-medium transition-colors outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
  {
    variants: {
      variant: {
        primary: "bg-primary text-white hover:opacity-90",
        secondary: "border border-border bg-surface text-text hover:bg-canvas",
        accent: "bg-primary text-white hover:opacity-90",
        // A plain, underlined text link ("Retour", a content toggle) —
        // the recurring alternative to a real button this app's own
        // screens keep reaching for as a bare, unstyled <button> instead
        // (docs/UI.md's Responsive conventions note: that pattern is now
        // a documented departure, not a free-standing choice). Cancels
        // every base box-shaping class instead of inheriting it, so the
        // visible box stays exactly the size of its own text — the 44px
        // touch target every other variant gets from min-h-11 would
        // change the vertical rhythm of a screen built around a small
        // text link, which docs/UI.md's own "rendu au-dessus du
        // breakpoint médian reste inchangé" rule (M10 Phase 1) forbids
        // touching here. The 44px target is reached a different way
        // instead: a `relative` positioning context plus a `before`
        // pseudo-element, absolutely positioned, fixed at 44px tall and
        // centred on the text via top-1/2 -translate-y-1/2 (not tied to
        // the text's own line-height, so it doesn't need recalculating if
        // the font size around it ever changes) and spanning the full
        // width of the button's own box (no horizontal change — only the
        // vertical dimension was ever short). A pseudo-element is part of
        // its host element's own hit-testing box, so clicking anywhere
        // inside it — even where nothing is visibly painted — registers
        // as a click on the button itself, exactly like a real button
        // that size would.
        link: "relative min-h-0 p-0 font-normal whitespace-normal text-text-muted underline before:absolute before:inset-x-0 before:top-1/2 before:h-11 before:-translate-y-1/2 before:content-['']",
      },
    },
    defaultVariants: {
      variant: "primary",
    },
  },
);

export interface ButtonProps
  extends React.ComponentProps<"button">,
    VariantProps<typeof buttonVariants> {}

function Button({ className, variant, ...props }: ButtonProps) {
  return <button data-slot="button" className={cn(buttonVariants({ variant, className }))} {...props} />;
}

export { Button, buttonVariants };
