import type { Difficulty } from "../../content/index.js";

export const WEEKDAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
export type Weekday = (typeof WEEKDAYS)[number];

export type Availability = Record<Weekday, number>;

// getPlan's default when the user has never set availability: buildPlan
// correctly turns this into Err({kind: "no-capacity"}), prompting the user
// to set it rather than silently guessing at a default workload.
export const ZERO_AVAILABILITY: Availability = Object.fromEntries(WEEKDAYS.map((day) => [day, 0])) as Availability;

export type PlanEntry =
  | { kind: "learn"; notionId: string; estimatedMinutes: number }
  | { kind: "review"; notionId: string; estimatedMinutes: number };

export type PlanDay = {
  date: string; // ISO date, no time (YYYY-MM-DD)
  entries: PlanEntry[];
  estimatedMinutes: number;
};

export type Plan = {
  days: PlanDay[];
  feasible: boolean; // false when the workload does not fit before the deadline
  shortfallMinutes: number; // requiredMinutes - plannedMinutes; 0 iff feasible
};

// A malformed request, not a workload that doesn't fit (docs/modules/planning.md).
export type PlanningInputError =
  | { kind: "deadline-in-past" }
  | { kind: "no-capacity" }
  | { kind: "no-usable-day" };

export type PlanNotion = { id: string; difficulty: Difficulty; masteredAt: string | null };

export type BuildPlanInput = {
  // Must already be in notion-position order — the same order
  // content.listNotions/getDueCards use. buildPlan never re-sorts; it uses
  // array order directly as the best-effort fill priority (docs/modules/planning.md).
  notions: PlanNotion[];
  deadline: string | null; // ISO date, no time; null means a steady, unbounded plan
  availability: Availability;
  now: Date;
  // Accepted per docs/modules/planning.md's domain signature. Not read by
  // buildPlan: replanning after a missed day needs no history-driven logic
  // (the spec's own Replanning section — calling buildPlan again from today
  // with whatever notions are still unmastered is sufficient). Flagged to
  // the human rather than silently dropped from the signature or built out
  // speculatively.
  history: { date: string; completed: boolean }[];
};
