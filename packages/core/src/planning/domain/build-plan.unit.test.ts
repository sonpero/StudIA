import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { buildPlan } from "./build-plan.js";
import { LEARN_MINUTES, REVIEW_MINUTES } from "./estimation.js";
import { WEEKDAYS, type Availability, type BuildPlanInput, type PlanNotion, type Weekday } from "./types.js";

const NOW = new Date("2026-03-02T09:00:00.000Z"); // a Monday
const TODAY_KEY = "2026-03-02";

function fullAvailability(minutes: number): Availability {
  return Object.fromEntries(WEEKDAYS.map((day) => [day, minutes])) as Availability;
}

function weekdayOf(dateKey: string): Weekday {
  const jsDay = new Date(`${dateKey}T00:00:00.000Z`).getUTCDay();
  return WEEKDAYS[(jsDay + 6) % 7]!;
}

function daysBetween(fromKey: string, toKey: string): number {
  const from = new Date(`${fromKey}T00:00:00.000Z`).getTime();
  const to = new Date(`${toKey}T00:00:00.000Z`).getTime();
  return Math.round((to - from) / 86_400_000);
}

function deadlineDaysOut(days: number): string {
  const d = new Date(NOW);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const difficultyArb = fc.constantFrom("easy" as const, "medium" as const, "hard" as const);

function notionsArb(maxCount = 12) {
  return fc.integer({ min: 0, max: maxCount }).chain((count) =>
    fc.tuple(...Array.from({ length: count }, () => difficultyArb)).map(
      (difficulties): PlanNotion[] => difficulties.map((difficulty, i) => ({ id: `n${i}`, difficulty, masteredAt: null })),
    ),
  );
}

// Every weekday has capacity, so the main property block never crosses into
// the invalid-input paths (no-capacity/no-usable-day), which are tested
// separately below.
const availabilityArb = fc
  .array(fc.integer({ min: 15, max: 120 }), { minLength: 7, maxLength: 7 })
  .map((minutes): Availability => Object.fromEntries(WEEKDAYS.map((day, i) => [day, minutes[i]!])) as Availability);

const validParamsArb = fc.record({
  notions: notionsArb(),
  deadlineDays: fc.integer({ min: 0, max: 30 }),
  availability: availabilityArb,
});

type ValidParams = { notions: PlanNotion[]; deadlineDays: number; availability: Availability };

function buildInput({ notions, deadlineDays, availability }: ValidParams): BuildPlanInput {
  return { notions, deadline: deadlineDaysOut(deadlineDays), availability, now: NOW, history: [] };
}

describe("buildPlan — hard invariants (property-tested, hold for every Ok plan)", () => {
  it("never exceeds a day's availability", () => {
    fc.assert(
      fc.property(validParamsArb, (params) => {
        const result = buildPlan(buildInput(params));
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        for (const day of result.value.days) {
          expect(day.estimatedMinutes).toBeLessThanOrEqual(params.availability[weekdayOf(day.date)]);
        }
      }),
    );
  });

  it("never schedules before today or after the deadline", () => {
    fc.assert(
      fc.property(validParamsArb, (params) => {
        const input = buildInput(params);
        const result = buildPlan(input);
        if (!result.ok) return;
        for (const day of result.value.days) {
          expect(day.date >= TODAY_KEY).toBe(true);
          expect(day.date <= input.deadline!).toBe(true);
        }
      }),
    );
  });

  it("places a notion's review at least one day after its learn", () => {
    fc.assert(
      fc.property(validParamsArb, (params) => {
        const result = buildPlan(buildInput(params));
        if (!result.ok) return;
        const learnDate = new Map<string, string>();
        const reviewDate = new Map<string, string>();
        for (const day of result.value.days) {
          for (const entry of day.entries) {
            (entry.kind === "learn" ? learnDate : reviewDate).set(entry.notionId, day.date);
          }
        }
        for (const [notionId, rDate] of reviewDate) {
          const lDate = learnDate.get(notionId);
          expect(lDate).toBeDefined();
          expect(rDate > (lDate as string)).toBe(true);
        }
      }),
    );
  });

  it("every entry's minutes come from the estimation table, strictly increasing with difficulty", () => {
    expect(LEARN_MINUTES.easy).toBeLessThan(LEARN_MINUTES.medium);
    expect(LEARN_MINUTES.medium).toBeLessThan(LEARN_MINUTES.hard);
    expect(REVIEW_MINUTES.easy).toBeLessThan(REVIEW_MINUTES.medium);
    expect(REVIEW_MINUTES.medium).toBeLessThan(REVIEW_MINUTES.hard);

    fc.assert(
      fc.property(validParamsArb, (params) => {
        const result = buildPlan(buildInput(params));
        if (!result.ok) return;
        const byId = new Map(params.notions.map((n) => [n.id, n.difficulty]));
        for (const day of result.value.days) {
          for (const entry of day.entries) {
            const difficulty = byId.get(entry.notionId)!;
            const table = entry.kind === "learn" ? LEARN_MINUTES : REVIEW_MINUTES;
            expect(entry.estimatedMinutes).toBe(table[difficulty]);
          }
        }
      }),
    );
  });

  it("never places a learn entry in the trailing review-only block before the deadline", () => {
    fc.assert(
      fc.property(validParamsArb.filter((p) => p.deadlineDays >= 1), (params) => {
        const result = buildPlan(buildInput(params));
        if (!result.ok) return;
        const windowLength = params.deadlineDays + 1;
        const reviewOnlyCount = Math.min(3, Math.max(windowLength - 1, 0));
        if (reviewOnlyCount === 0) return;
        const reviewOnlyStartIndex = windowLength - reviewOnlyCount;
        for (const day of result.value.days) {
          const dayIndex = daysBetween(TODAY_KEY, day.date);
          if (dayIndex >= reviewOnlyStartIndex) {
            expect(day.entries.every((e) => e.kind === "review")).toBe(true);
          }
        }
      }),
    );
  });

  it("is deterministic: same input twice, deep-equal plans, including on the infeasible path", () => {
    fc.assert(
      fc.property(validParamsArb, (params) => {
        const input = buildInput(params);
        expect(buildPlan(input)).toEqual(buildPlan(input));
      }),
    );
  });
});

describe("buildPlan — conditional invariant and the shortfall/feasible equivalence", () => {
  it("covers every notion (learn + review) when feasible", () => {
    fc.assert(
      fc.property(validParamsArb, (params) => {
        const result = buildPlan(buildInput(params));
        if (!result.ok || !result.value.feasible) return;
        const learned = new Set<string>();
        const reviewed = new Set<string>();
        for (const day of result.value.days) {
          for (const e of day.entries) (e.kind === "learn" ? learned : reviewed).add(e.notionId);
        }
        for (const notion of params.notions) {
          expect(learned.has(notion.id)).toBe(true);
          expect(reviewed.has(notion.id)).toBe(true);
        }
      }),
    );
  });

  it("shortfallMinutes is 0 if and only if feasible is true", () => {
    fc.assert(
      fc.property(validParamsArb, (params) => {
        const result = buildPlan(buildInput(params));
        if (!result.ok) return;
        expect(result.value.shortfallMinutes === 0).toBe(result.value.feasible);
      }),
    );
  });
});

describe("buildPlan — mastered notions", () => {
  it("excludes an already-mastered notion entirely", () => {
    const input: BuildPlanInput = {
      notions: [{ id: "m1", difficulty: "hard", masteredAt: "2026-01-01T00:00:00.000Z" }],
      deadline: deadlineDaysOut(10),
      availability: fullAvailability(60),
      now: NOW,
      history: [],
    };
    expect(buildPlan(input)).toEqual({ ok: true, value: { days: [], feasible: true, shortfallMinutes: 0 } });
  });
});

describe("buildPlan — infeasibility is data, never an error", () => {
  it("40 hard notions, three days, 20 minutes a day: feasible:false, correct shortfall, still schedules something", () => {
    const notions: PlanNotion[] = Array.from({ length: 40 }, (_, i) => ({ id: `h${i}`, difficulty: "hard" as const, masteredAt: null }));
    const input: BuildPlanInput = { notions, deadline: deadlineDaysOut(2), availability: fullAvailability(20), now: NOW, history: [] };
    const result = buildPlan(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.feasible).toBe(false);
    expect(result.value.shortfallMinutes).toBeGreaterThan(0);
    expect(result.value.shortfallMinutes).toBeLessThan(40 * (LEARN_MINUTES.hard + REVIEW_MINUTES.hard));
    expect(result.value.days.length).toBeGreaterThan(0);
    expect(result.value.days.some((d) => d.entries.length > 0)).toBe(true);
  });

  it("a single atomic notion too big for every day is feasible:false, never a PlanningInputError", () => {
    const input: BuildPlanInput = {
      notions: [{ id: "big", difficulty: "hard", masteredAt: null }],
      deadline: deadlineDaysOut(10),
      availability: fullAvailability(LEARN_MINUTES.hard - 1),
      now: NOW,
      history: [],
    };
    const result = buildPlan(input);
    expect(result).toEqual({
      ok: true,
      value: { days: [], feasible: false, shortfallMinutes: LEARN_MINUTES.hard + REVIEW_MINUTES.hard },
    });
  });

  it("an oversized notion does not block smaller notions behind it in position order", () => {
    const input: BuildPlanInput = {
      notions: [
        { id: "big", difficulty: "hard", masteredAt: null },
        { id: "small", difficulty: "easy", masteredAt: null },
      ],
      deadline: deadlineDaysOut(10),
      availability: fullAvailability(LEARN_MINUTES.hard - 1),
      now: NOW,
      history: [],
    };
    const result = buildPlan(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Still feasible:false overall — "big" alone is permanently unplaceable —
    // but that must not stop "small" from being scheduled around it.
    expect(result.value.feasible).toBe(false);
    const notionIds = result.value.days.flatMap((d) => d.entries.map((e) => e.notionId));
    expect(notionIds).toContain("small");
    expect(notionIds).not.toContain("big");
  });
});

describe("buildPlan — invalid input is a typed error, never a Plan", () => {
  it("refuses a deadline before today", () => {
    const input: BuildPlanInput = { notions: [], deadline: "2026-03-01", availability: fullAvailability(30), now: NOW, history: [] };
    expect(buildPlan(input)).toEqual({ ok: false, error: { kind: "deadline-in-past" } });
  });

  it("refuses zero capacity on every weekday", () => {
    const input: BuildPlanInput = { notions: [], deadline: deadlineDaysOut(5), availability: fullAvailability(0), now: NOW, history: [] };
    expect(buildPlan(input)).toEqual({ ok: false, error: { kind: "no-capacity" } });
  });

  it("refuses a deadline window with no usable weekday occurrence", () => {
    const availability = fullAvailability(0);
    availability.sun = 30; // capacity exists, but the window below never touches a Sunday
    const input: BuildPlanInput = { notions: [], deadline: deadlineDaysOut(1), availability, now: NOW, history: [] }; // Mon, Tue
    expect(buildPlan(input)).toEqual({ ok: false, error: { kind: "no-usable-day" } });
  });
});

describe("buildPlan — no deadline (steady plan)", () => {
  it("eventually covers every placeable notion without running out", () => {
    const notions: PlanNotion[] = Array.from({ length: 6 }, (_, i) => ({
      id: `n${i}`,
      difficulty: (["easy", "medium", "hard"] as const)[i % 3]!,
      masteredAt: null,
    }));
    const input: BuildPlanInput = { notions, deadline: null, availability: fullAvailability(30), now: NOW, history: [] };
    const result = buildPlan(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.feasible).toBe(true);
    expect(result.value.shortfallMinutes).toBe(0);
    for (const day of result.value.days) expect(day.estimatedMinutes).toBeLessThanOrEqual(30);
  });
});

describe("buildPlan — missed-day replanning needs no separate algorithm", () => {
  it("calling buildPlan again from a later now, with the still-unmastered notions, redistributes without a backlog or a capacity violation", () => {
    const notions: PlanNotion[] = Array.from({ length: 8 }, (_, i) => ({ id: `n${i}`, difficulty: "medium" as const, masteredAt: null }));
    const availability = fullAvailability(30);
    const first = buildPlan({ notions, deadline: deadlineDaysOut(10), availability, now: NOW, history: [] });
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    // Simulate four missed days: nothing was actually learned, so every
    // notion is still unmastered — buildPlan is simply called again later.
    const later = new Date(NOW);
    later.setUTCDate(later.getUTCDate() + 4);
    const second = buildPlan({ notions, deadline: deadlineDaysOut(10), availability, now: later, history: [] });
    expect(second.ok).toBe(true);
    if (!second.ok) return;

    const laterKey = later.toISOString().slice(0, 10);
    for (const day of second.value.days) {
      expect(day.date >= laterKey).toBe(true);
      expect(day.estimatedMinutes).toBeLessThanOrEqual(30);
    }
  });
});
