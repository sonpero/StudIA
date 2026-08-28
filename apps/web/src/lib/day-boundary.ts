// Dueness is a calendar-day threshold decided by the user's own clock, never
// a fixed server timezone (product decision): the client computes "start of
// tomorrow" in its own local timezone and sends that instant to the API.
export function startOfTomorrowISO(now: Date = new Date()): string {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString();
}
