function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function toDateKey(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

// Both bounds inclusive, local-time constructors throughout (never a UTC
// slice) — same rule as day-boundary.ts's todayDateKey: the browsed month
// is the client's own local calendar, never re-derived from an instant on
// the server. Day 0 of the following month is the last day of this one, a
// JS Date quirk used deliberately rather than a leap-year table.
export function monthRange(year: number, month: number): { start: string; end: string } {
  const start = toDateKey(new Date(year, month, 1));
  const end = toDateKey(new Date(year, month + 1, 0));
  return { start, end };
}

// "Mars 2026" (docs/UI.md's Calendrier note): fr-FR's own long-month
// format is lower-case ("mars 2026"), so the first letter is capitalised
// by hand rather than assuming the locale already matches the reference.
export function monthLabel(year: number, month: number): string {
  const formatted = new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric" }).format(new Date(year, month, 1));
  return formatted.charAt(0).toUpperCase() + formatted.slice(1);
}

export type CalendarGridDay = { dateKey: string; inMonth: boolean };

// A whole number of Monday-first weeks, always — leading days from the
// previous month and trailing days from the next fill the first and last
// rows so every row is a complete week (docs/UI.md's Calendrier note: "a
// row per week"). getDay() is Sunday-first (0-6); +6 mod 7 reindexes it
// Monday-first (0-6) without a lookup table.
export function buildMonthGrid(year: number, month: number): CalendarGridDay[] {
  const mondayIndex = (date: Date): number => (date.getDay() + 6) % 7;

  const firstOfMonth = new Date(year, month, 1);
  const lastOfMonth = new Date(year, month + 1, 0);
  const gridStart = new Date(year, month, 1 - mondayIndex(firstOfMonth));
  const trailingDays = 6 - mondayIndex(lastOfMonth);
  const gridEnd = new Date(year, month, lastOfMonth.getDate() + trailingDays);

  const days: CalendarGridDay[] = [];
  const cursor = new Date(gridStart);
  while (cursor <= gridEnd) {
    days.push({ dateKey: toDateKey(cursor), inMonth: cursor.getMonth() === month });
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}
