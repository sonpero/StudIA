// Shared by every native form field styled to match the design system
// (docs/UI.md's Shape and depth: "native form controls still get the
// design-system border, radius and colour tokens"). Originally defined
// once inside TodayScreen.tsx's own AddTodoForm; PomodoroCard's todo
// picker needs the exact same treatment, so this moved here rather than
// being duplicated a second time.

// A design-system chevron replacing <select>'s native arrow (--color-text-muted,
// #667085, matched by hand — tokens.css's @theme values aren't reachable from
// a plain string literal). appearance-none removes the browser's own arrow;
// this is its token-coloured replacement, not a decoration on top of it.
export const SELECT_CHEVRON =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20' fill='%23667085'%3E%3Cpath fill-rule='evenodd' d='M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z' clip-rule='evenodd'/%3E%3C/svg%3E\")";

// The two [&::-webkit-calendar-picker-indicator] rules are what actually
// stop a native <input type="date"> from reading as an unstyled control
// (docs/UI.md's Shape and depth) — width alone did not.
export const FIELD_CLASS =
  "w-full appearance-none rounded-[var(--radius-button)] border border-border bg-surface p-2 text-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-60";
