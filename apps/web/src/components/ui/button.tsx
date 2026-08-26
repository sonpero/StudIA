import { clsx } from "clsx";
import type { ButtonHTMLAttributes } from "react";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "accent" | "primary" | "secondary";
}

const VARIANT_CLASSES: Record<NonNullable<ButtonProps["variant"]>, string> = {
  accent: "bg-accent text-white hover:opacity-90",
  primary: "bg-primary text-white hover:opacity-90",
  secondary: "bg-surface text-text border border-border hover:bg-canvas",
};

// Hand-rolled rather than fetched via the shadcn CLI (no network access to
// its registry from this environment): same shape shadcn/ui would generate
// — Tailwind classes driven by tokens.css, no component library dependency.
export function Button({ variant = "primary", className, ...props }: ButtonProps) {
  return (
    <button
      className={clsx(
        "min-h-11 rounded-[var(--radius-button)] px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
        VARIANT_CLASSES[variant],
        className,
      )}
      {...props}
    />
  );
}
