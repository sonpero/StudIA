import { clsx } from "clsx";
import type { HTMLAttributes } from "react";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={clsx(
        "rounded-[var(--radius-card)] border border-border bg-surface p-4 shadow-[0_1px_2px_rgba(16,24,40,.05)]",
        className,
      )}
      {...props}
    />
  );
}
