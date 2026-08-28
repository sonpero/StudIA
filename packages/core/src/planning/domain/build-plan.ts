import { err, ok, type Result } from "../../shared/index.js";
import { LEARN_MINUTES, REVIEW_MINUTES } from "./estimation.js";
import { WEEKDAYS, type Availability, type BuildPlanInput, type Plan, type PlanDay, type PlanEntry, type PlanNotion, type PlanningInputError, type Weekday } from "./types.js";

function toDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function weekdayOf(dateKey: string): Weekday {
  const jsDay = new Date(`${dateKey}T00:00:00.000Z`).getUTCDay(); // 0=Sun..6=Sat
  return WEEKDAYS[(jsDay + 6) % 7]!; // WEEKDAYS is mon-first
}

function addDaysToKey(dateKey: string, days: number): string {
  const d = new Date(`${dateKey}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return toDateKey(d);
}

function enumerateWindow(todayKey: string, deadlineKey: string): { dateKey: string; weekday: Weekday }[] {
  const days: { dateKey: string; weekday: Weekday }[] = [];
  for (let cursor = todayKey; cursor <= deadlineKey; cursor = addDaysToKey(cursor, 1)) {
    days.push({ dateKey: cursor, weekday: weekdayOf(cursor) });
  }
  return days;
}

function finalizePlan(working: PlanNotion[], entriesByDate: Map<string, PlanEntry[]>): Plan {
  const requiredMinutes = working.reduce((sum, n) => sum + LEARN_MINUTES[n.difficulty] + REVIEW_MINUTES[n.difficulty], 0);
  const days: PlanDay[] = [...entriesByDate.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([date, entries]) => ({ date, entries, estimatedMinutes: entries.reduce((sum, e) => sum + e.estimatedMinutes, 0) }));
  const plannedMinutes = days.reduce((sum, d) => sum + d.estimatedMinutes, 0);
  const shortfallMinutes = requiredMinutes - plannedMinutes;
  return { days, feasible: shortfallMinutes === 0, shortfallMinutes };
}

// Backward plan bounded by a deadline. The window splits into a leading
// learn-eligible block and a trailing review-only block (docs/modules/planning.md:
// "the last three days are review-only"), capped so at least one learn-eligible
// day remains whenever the window has any length at all.
function buildBoundedPlan(
  working: PlanNotion[],
  placeable: PlanNotion[],
  window: { dateKey: string; weekday: Weekday }[],
  availability: Availability,
): Plan {
  const reviewOnlyCount = Math.min(3, Math.max(window.length - 1, 0));
  const learnDays = window.slice(0, window.length - reviewOnlyCount);
  const reviewDays = window.slice(window.length - reviewOnlyCount);

  const remaining = new Map(window.map((d) => [d.dateKey, availability[d.weekday]]));
  const entriesByDate = new Map<string, PlanEntry[]>();
  function place(dateKey: string, entry: PlanEntry): void {
    const list = entriesByDate.get(dateKey) ?? [];
    list.push(entry);
    entriesByDate.set(dateKey, list);
    remaining.set(dateKey, (remaining.get(dateKey) ?? 0) - entry.estimatedMinutes);
  }

  // Position-order FIFO, no skip-ahead within a day: an earlier notion that
  // doesn't fit today's remainder is retried tomorrow, never jumped by a
  // smaller one behind it (docs/modules/planning.md's best-effort order).
  const learnQueue = [...placeable];
  const learnedOrder: PlanNotion[] = [];
  for (const day of learnDays) {
    while (learnQueue.length > 0 && (remaining.get(day.dateKey) ?? 0) >= LEARN_MINUTES[learnQueue[0]!.difficulty]) {
      const head = learnQueue.shift()!;
      place(day.dateKey, { kind: "learn", notionId: head.id, estimatedMinutes: LEARN_MINUTES[head.difficulty] });
      learnedOrder.push(head);
    }
    if (learnQueue.length === 0) break;
  }

  const reviewQueue = [...learnedOrder];
  for (const day of reviewDays) {
    while (reviewQueue.length > 0 && (remaining.get(day.dateKey) ?? 0) >= REVIEW_MINUTES[reviewQueue[0]!.difficulty]) {
      const head = reviewQueue.shift()!;
      place(day.dateKey, { kind: "review", notionId: head.id, estimatedMinutes: REVIEW_MINUTES[head.difficulty] });
    }
    if (reviewQueue.length === 0) break;
  }

  return finalizePlan(working, entriesByDate);
}

// No deadline: a steady, forward plan, generated day by day for as long as
// notions remain. There is no "last three days" to cluster reviews toward
// (docs/modules/planning.md's clustering rule is deadline-relative), so
// learn and review share each day's capacity as it goes.
function buildSteadyPlan(working: PlanNotion[], placeable: PlanNotion[], todayKey: string, availability: Availability): Plan {
  const entriesByDate = new Map<string, PlanEntry[]>();
  const remaining = new Map<string, number>();
  function place(dateKey: string, entry: PlanEntry): void {
    const list = entriesByDate.get(dateKey) ?? [];
    list.push(entry);
    entriesByDate.set(dateKey, list);
    remaining.set(dateKey, (remaining.get(dateKey) ?? 0) - entry.estimatedMinutes);
  }

  const learnQueue = [...placeable];
  const reviewQueue: { notion: PlanNotion; learnedOn: string }[] = [];

  // A generous, provably-sufficient bound: even if only one weekday ever has
  // capacity, it recurs every 7 days, and each occurrence places at least
  // one entry once it's at the front of a queue — two occurrences worst case
  // per notion (learn, then review), plus slack.
  const maxDays = 7 * (2 * placeable.length + 20);
  let cursor = todayKey;
  for (let i = 0; i < maxDays && (learnQueue.length > 0 || reviewQueue.length > 0); i++) {
    if (!remaining.has(cursor)) remaining.set(cursor, availability[weekdayOf(cursor)]);

    while (learnQueue.length > 0 && (remaining.get(cursor) ?? 0) >= LEARN_MINUTES[learnQueue[0]!.difficulty]) {
      const head = learnQueue.shift()!;
      place(cursor, { kind: "learn", notionId: head.id, estimatedMinutes: LEARN_MINUTES[head.difficulty] });
      reviewQueue.push({ notion: head, learnedOn: cursor });
    }
    // learnedOn < cursor enforces the >=1-day gap; a notion learned today
    // stays at the front and is simply retried on a later iteration.
    while (
      reviewQueue.length > 0 &&
      reviewQueue[0]!.learnedOn < cursor &&
      (remaining.get(cursor) ?? 0) >= REVIEW_MINUTES[reviewQueue[0]!.notion.difficulty]
    ) {
      const { notion } = reviewQueue.shift()!;
      place(cursor, { kind: "review", notionId: notion.id, estimatedMinutes: REVIEW_MINUTES[notion.difficulty] });
    }

    cursor = addDaysToKey(cursor, 1);
  }

  return finalizePlan(working, entriesByDate);
}

export function buildPlan(input: BuildPlanInput): Result<Plan, PlanningInputError> {
  const { notions, deadline, availability, now } = input;
  const todayKey = toDateKey(now);

  const maxCapacity = Math.max(...WEEKDAYS.map((w) => availability[w]));
  if (maxCapacity <= 0) return err({ kind: "no-capacity" });

  const working = notions.filter((n) => n.masteredAt === null);
  // A notion whose learn minutes exceed every weekday's capacity can never
  // fit, ever — excluded up front so it contributes to the shortfall without
  // permanently blocking the FIFO queue behind it (docs/modules/planning.md's
  // atomic-notion case).
  const placeable = working.filter((n) => LEARN_MINUTES[n.difficulty] <= maxCapacity);

  if (deadline !== null) {
    if (deadline < todayKey) return err({ kind: "deadline-in-past" });
    const window = enumerateWindow(todayKey, deadline);
    if (window.every((d) => availability[d.weekday] <= 0)) return err({ kind: "no-usable-day" });
    return ok(buildBoundedPlan(working, placeable, window, availability));
  }

  return ok(buildSteadyPlan(working, placeable, todayKey, availability));
}
