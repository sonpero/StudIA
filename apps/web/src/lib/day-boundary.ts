// Dueness is a calendar-day threshold decided by the user's own clock, never
// a fixed server timezone (product decision): the client computes "start of
// tomorrow" in its own local timezone and sends that instant to the API.
export function startOfTomorrowISO(now: Date = new Date()): string {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString();
}

// Same product decision, applied to planning: "what day is today" for the
// backward planner's window is the user's own local calendar day, never
// guessed server-side. A plain "YYYY-MM-DD" (not an instant like
// startOfTomorrowISO above): the server only ever needs the date key, never
// a specific moment within the day, so there is no timezone-instant math
// for the server to get wrong by re-deriving it from a UTC-sliced instant.
export function todayDateKey(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}
